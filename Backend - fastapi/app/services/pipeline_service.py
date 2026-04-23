import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Tuple

from app.config.logging_config import get_logger
from app.services.analysis_service import (
    get_files_by_session,
    get_results_by_session,
    save_similarity_result,
    update_extracted_text,
    update_preprocessed_text,
    update_session_progress,
    update_session_status,
)
from app.services.nlp_service import preprocess_text, normalize_text
from app.services.similarity_service import build_document_pair_result
from app.services.text_extraction_service import extract_text

logger = get_logger(__name__)

# Parallelism tuning — safe for most laptops
# OCR is CPU-bound so we keep extraction at 1 (Tesseract itself is multi-threaded)
# Pair comparison is mostly CPU-bound but lighter, so 2 workers is safe
EXTRACTION_WORKERS = 1
PAIR_WORKERS = 2


def _has_complete_layout_metadata(file_doc: dict) -> bool:
    pages = file_doc.get("page_metadata") or []
    if not pages:
        return False

    first_page = pages[0]
    file_type = (file_doc.get("file_type") or "").lower()
    if file_type in {"pdf", "jpg", "jpeg", "png"}:
        return bool(first_page.get("image_url") and first_page.get("lines"))

    return bool(first_page.get("lines"))


def _extract_one_file(file_doc: dict, session_id: str) -> dict:
    session_dir = os.path.join("uploads/sessions", session_id)
    file_path = os.path.join(session_dir, file_doc["filename"])

    if not os.path.exists(file_path):
        return {
            "file_id": file_doc["file_id"],
            "filename": file_doc.get("filename"),
            "skipped": True,
            "reason": "file not found",
        }

    try:
        text, page_meta, method = extract_text(
            file_path, file_doc["file_type"], session_id, file_doc["file_id"]
        )

        return {
            "file_id": file_doc["file_id"],
            "filename": file_doc["filename"],
            "text": text or "",
            "method": method,
            "page_meta": page_meta,
            "error": None,
        }
    except Exception as exc:
        logger.error(f"Error extracting file {file_doc.get('filename')}: {str(exc)}", exc_info=True)
        return {
            "file_id": file_doc["file_id"],
            "filename": file_doc.get("filename", "unknown"),
            "error": str(exc),
        }


def _extract_all_files(files: List[dict], session_id: str) -> None:
    pending = [
        file_doc
        for file_doc in files
        if not (file_doc.get("extracted_text") and _has_complete_layout_metadata(file_doc))
    ]
    if not pending:
        logger.info(f"No files pending extraction for session {session_id}")
        return

    total = len(pending)
    logger.info(f"Starting extraction for {total} files in session {session_id}")

    with ThreadPoolExecutor(max_workers=EXTRACTION_WORKERS) as executor:
        futures = {
            executor.submit(_extract_one_file, file_doc, session_id): file_doc
            for file_doc in pending
        }

        done_count = 0
        for future in as_completed(futures):
            result = future.result()
            done_count += 1

            if result.get("skipped") or result.get("error"):
                logger.warning(
                    f"  [{done_count}/{total}] {result.get('filename', '?')} — "
                    f"{'skipped' if result.get('skipped') else result.get('error', 'unknown error')}"
                )
                continue

            update_extracted_text(
                result["file_id"],
                result["text"],
                result["method"],
                result["page_meta"],
            )
            logger.info(
                f"  [{done_count}/{total}] {result['filename']} — "
                f"{len(result['text'])} chars via {result['method']}"
            )
            # Update progress: extraction is 15-50% of pipeline
            pct = 15 + int((done_count / total) * 35)
            update_session_progress(
                session_id,
                f"Extracting Documents ({done_count}/{total})",
                pct,
            )


def _preprocess_all_files(files: List[dict]) -> None:
    logger.info(f"Starting preprocessing for {len(files)} files")
    for file_doc in files:
        raw_text = file_doc.get("extracted_text")
        if raw_text is None:
            continue
        if file_doc.get("preprocessed_text") is not None:
            continue

        update_preprocessed_text(file_doc["file_id"], preprocess_text(raw_text))


# ---------------------------------------------------------------------------
#  FAST PRE-FILTER — skip pairs that are clearly different
# ---------------------------------------------------------------------------

def _quick_document_similarity(file_a: dict, file_b: dict) -> float:
    """
    Fast document-level similarity check using token overlap.
    NO TF-IDF, NO embeddings, NO page-level analysis.
    Just counts shared words — runs in < 1ms per pair.

    Returns 0.0–1.0.
    """
    text_a = normalize_text(file_a.get("extracted_text", "") or "")
    text_b = normalize_text(file_b.get("extracted_text", "") or "")

    if not text_a or not text_b:
        return 0.0

    words_a = set(text_a.split())
    words_b = set(text_b.split())

    if not words_a or not words_b:
        return 0.0

    intersection = len(words_a & words_b)
    smaller = min(len(words_a), len(words_b))
    return intersection / max(smaller, 1)


def _prefilter_pairs(
    files: List[dict],
    min_quick_similarity: float = 0.03,
) -> List[Tuple[dict, dict, float]]:
    """
    Pre-filter document pairs using fast token overlap.

    Threshold is kept very low (0.03) because OCR on handwritten text
    often produces different words for the same handwriting.  The real
    comparison (hybrid TF-IDF + embeddings) will sort out false positives.
    """
    ordered_files = sorted(files, key=lambda f: f["file_id"])
    candidates = []
    skipped = 0

    for index_a, file_a in enumerate(ordered_files):
        for index_b in range(index_a + 1, len(ordered_files)):
            file_b = ordered_files[index_b]

            quick_score = _quick_document_similarity(file_a, file_b)
            if quick_score >= min_quick_similarity:
                candidates.append((file_a, file_b, quick_score))
            else:
                skipped += 1

    # Sort by quick score descending — most promising pairs first
    candidates.sort(key=lambda x: x[2], reverse=True)

    total = len(candidates) + skipped
    logger.info(
        f"Pre-filter: {len(candidates)} promising pairs out of {total} total "
        f"(skipped {skipped} clearly-different pairs)"
    )
    return candidates


# ---------------------------------------------------------------------------
#  PAIR COMPARISON
# ---------------------------------------------------------------------------

def _run_pair(session_id: str, file_a: dict, file_b: dict) -> dict:
    if file_a["file_id"] == file_b["file_id"]:
        return None

    logger.debug(f"Running similarity for pair: {file_a['filename']} vs {file_b['filename']}")
    pair_result = build_document_pair_result(file_a, file_b)
    save_similarity_result(session_id, file_a, file_b, pair_result)
    return pair_result


def _run_all_pairs(session_id: str, files: List[dict]) -> List[dict]:
    # Step 1: Fast pre-filter
    update_session_progress(session_id, "Pre-filtering Document Pairs", 55)
    candidates = _prefilter_pairs(files)

    if not candidates:
        logger.info(f"No similar pairs found for session {session_id} after pre-filtering")
        return []

    total_pairs = len(candidates)
    logger.info(f"Processing {total_pairs} similarity pairs for session {session_id}")
    update_session_progress(
        session_id,
        f"Comparing Documents (0/{total_pairs})",
        60,
    )

    # Step 2: Run page-level comparison for promising pairs
    results = []
    done_count = 0

    with ThreadPoolExecutor(max_workers=PAIR_WORKERS) as executor:
        futures = {
            executor.submit(_run_pair, session_id, file_a, file_b): (file_a, file_b)
            for file_a, file_b, _ in candidates
        }

        for future in as_completed(futures):
            result = future.result()
            done_count += 1
            if result is not None:
                results.append(result)

            # Update progress: comparison is 60-95% of pipeline
            if done_count % max(1, total_pairs // 10) == 0 or done_count == total_pairs:
                pct = 60 + int((done_count / total_pairs) * 35)
                update_session_progress(
                    session_id,
                    f"Comparing Documents ({done_count}/{total_pairs})",
                    min(pct, 95),
                )

    return sorted(results, key=lambda item: item["score"], reverse=True)


def process_session_background_pipeline(session_id: str):
    try:
        update_session_status(session_id, "PROCESSING")
        update_session_progress(session_id, "Initializing Pipeline", 5)

        files = get_files_by_session(session_id)
        if not files:
            update_session_progress(session_id, "No files found", 100)
            update_session_status(session_id, "FAILED")
            return

        update_session_progress(session_id, "Extracting Document Text (OCR)", 15)
        _extract_all_files(files, session_id)

        files = get_files_by_session(session_id)
        update_session_progress(session_id, "Preprocessing Content", 50)
        _preprocess_all_files(files)

        extracted_files = [
            file_doc for file_doc in get_files_by_session(session_id) if file_doc.get("extracted_text")
        ]

        if len(extracted_files) < 2:
            msg = (
                f"Only {len(extracted_files)} of {len(files)} files had extractable text. "
                "Need at least 2 files with readable content to compare."
            )
            logger.warning(f"Session {session_id}: {msg}")
            update_session_progress(session_id, "Insufficient readable files", 100)
            update_session_status(session_id, "COMPLETED")
            return

        results = _run_all_pairs(session_id, extracted_files)
        update_session_progress(session_id, "Finalizing Results", 95)
        update_session_status(session_id, "COMPLETED")
        update_session_progress(session_id, "Complete", 100)
        logger.info(
            f"Pipeline completed for session {session_id}: "
            f"{len(extracted_files)} files, {len(results)} pairs analyzed"
        )
    except Exception as exc:
        logger.error(f"Pipeline failed for session {session_id}: {str(exc)}", exc_info=True)
        update_session_progress(session_id, "Analysis Failed", 0)
        update_session_status(session_id, "FAILED")


def run_similarity_pipeline(session_id: str, files: List[dict]) -> List[dict]:
    extracted_files = [file_doc for file_doc in files if file_doc.get("extracted_text")]
    if len(extracted_files) < 2:
        return []

    _run_all_pairs(session_id, extracted_files)
    return get_results_by_session(session_id)
