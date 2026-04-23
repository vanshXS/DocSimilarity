import re
from difflib import SequenceMatcher
from typing import List

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.config.logging_config import get_logger
from app.services.embedding_service import (
    compute_similarity_matrix_from_embeddings,
    get_embeddings,
)
from app.services.nlp_service import normalize_text

logger = get_logger(__name__)

_WORD_PATTERN = re.compile(r"\b[a-z0-9]+\b", re.IGNORECASE)


def _coerce_page_line_entries(page: dict) -> List[dict]:
    values = []
    for line in page.get("lines") or []:
        if isinstance(line, str):
            text = line.strip()
            entry = {"text": text, "anchor_x": None, "anchor_y": None}
        elif isinstance(line, dict):
            text = str(line.get("text", "")).strip()
            entry = {
                "text": text,
                "anchor_x": line.get("anchor_x"),
                "anchor_y": line.get("anchor_y"),
            }
        else:
            text = str(line).strip()
            entry = {"text": text, "anchor_x": None, "anchor_y": None}

        if text:
            values.append(entry)

    return values


def build_page_text(page: dict) -> str:
    return "\n".join(line["text"] for line in _coerce_page_line_entries(page))


def compute_page_similarity_matrix(pages_a: List[dict], pages_b: List[dict]) -> np.ndarray:
    """
    Hybrid page similarity using BOTH TF-IDF and neural embeddings.

    Why hybrid?
    - TF-IDF is fast and catches exact word matches (direct copies).
    - Embeddings (MiniLM) understand *meaning*, so they handle OCR errors,
      paraphrasing, and word-order differences that TF-IDF misses.
    - We take the MAXIMUM of both scores: if either method detects
      similarity, we flag the pair.  This prevents OCR typos from
      hiding genuine plagiarism.
    """
    if not pages_a or not pages_b:
        return np.empty((len(pages_a), len(pages_b)))

    texts_a = [normalize_text(build_page_text(page)) or " " for page in pages_a]
    texts_b = [normalize_text(build_page_text(page)) or " " for page in pages_b]

    # --- Method 1: TF-IDF (exact word matching, fast) ---
    vectorizer = TfidfVectorizer()
    tfidf_matrix = vectorizer.fit_transform(texts_a + texts_b)
    tfidf_a = tfidf_matrix[: len(texts_a)]
    tfidf_b = tfidf_matrix[len(texts_a) :]
    tfidf_sim = cosine_similarity(tfidf_a, tfidf_b)

    # --- Method 2: Semantic Embeddings (handles OCR errors, paraphrasing) ---
    try:
        embeddings_a = get_embeddings(texts_a)
        embeddings_b = get_embeddings(texts_b)
        embed_sim = compute_similarity_matrix_from_embeddings(embeddings_a, embeddings_b)
    except Exception as exc:
        logger.warning(f"Embedding computation failed, using TF-IDF only: {exc}")
        embed_sim = tfidf_sim

    # Take the higher score from either method — prevents false negatives
    combined = np.maximum(tfidf_sim, embed_sim)

    logger.debug(
        f"Hybrid similarity matrix {len(texts_a)}x{len(texts_b)} pages "
        f"(tfidf max={tfidf_sim.max():.2f}, embed max={embed_sim.max():.2f})"
    )
    return combined


def compute_document_similarity(page_similarity_matrix: np.ndarray) -> int:
    if page_similarity_matrix.size == 0:
        return 0

    best_scores_a = page_similarity_matrix.max(axis=1)
    best_scores_b = page_similarity_matrix.max(axis=0)
    average_score = (float(best_scores_a.mean()) + float(best_scores_b.mean())) / 2.0
    return int(round(average_score * 100))


def _extract_words(text: str) -> List[str]:
    return _WORD_PATTERN.findall(normalize_text(text))


def _looks_like_noise(text: str) -> bool:
    words = _extract_words(text)
    if len(words) < 1:
        return True

    alpha_chars = sum(1 for char in text if char.isalpha())
    non_space_chars = len(text.replace(" ", ""))
    if non_space_chars == 0:
        return True

    return (alpha_chars / non_space_chars) < 0.40


def _split_into_sections(page: dict) -> List[dict]:
    """
    Split page into meaningful text sections for comparison.

    Merges consecutive lines into ~50-80 word sections instead of
    splitting on every sentence-ending punctuation. This produces
    fewer, higher-quality matches instead of noisy micro-matches.
    """
    lines = _coerce_page_line_entries(page)
    if not lines:
        return []

    sections = []
    current_lines = []
    current_entries = []
    start_index = 0

    for line_index, entry in enumerate(lines):
        stripped = entry["text"].strip()
        if not stripped:
            continue

        if _looks_like_noise(stripped):
            # Flush current section on noise boundary
            if current_lines:
                joined = " ".join(current_lines).strip()
                if len(_extract_words(joined)) >= 2 and len(joined) >= 10:
                    sections.append({
                        "start": start_index,
                        "end": line_index - 1,
                        "text": joined,
                        "entries": list(current_entries),
                    })
                current_lines = []
                current_entries = []
            continue

        if not current_lines:
            start_index = line_index

        current_lines.append(stripped)
        current_entries.append(entry)

        # Create a new section when we have enough content (~50+ words)
        # This prevents micro-sections from single sentences
        joined = " ".join(current_lines).strip()
        word_count = len(_extract_words(joined))

        if word_count >= 50:
            if len(joined) >= 30:
                sections.append({
                    "start": start_index,
                    "end": line_index,
                    "text": joined,
                    "entries": list(current_entries),
                })
            current_lines = []
            current_entries = []

    # Flush remaining content
    if current_lines:
        joined = " ".join(current_lines).strip()
        if len(_extract_words(joined)) >= 2 and len(joined) >= 10:
            sections.append({
                "start": start_index,
                "end": start_index + len(current_lines) - 1,
                "text": joined,
                "entries": list(current_entries),
            })

    return sections


def _token_overlap_ratio(text_a: str, text_b: str) -> float:
    words_a = {word for word in _extract_words(text_a) if len(word) >= 2}
    words_b = {word for word in _extract_words(text_b) if len(word) >= 2}

    if not words_a or not words_b:
        return 0.0

    intersection = len(words_a & words_b)
    return intersection / max(1, min(len(words_a), len(words_b)))


def _length_balance(text_a: str, text_b: str) -> float:
    len_a = len(_extract_words(text_a))
    len_b = len(_extract_words(text_b))
    if len_a == 0 or len_b == 0:
        return 0.0
    return min(len_a, len_b) / max(len_a, len_b)


def _char_trigram_similarity(text_a: str, text_b: str) -> float:
    """
    Character trigram Jaccard similarity.

    Extremely robust to OCR errors: a single character mistake
    (e.g. 'algorithm' → 'algoritm') only affects 3 out of N trigrams.
    This is the best metric for comparing noisy handwriting OCR output.
    """
    def _trigrams(text: str) -> set:
        normalized = normalize_text(text)
        if len(normalized) < 3:
            return set()
        return {normalized[i : i + 3] for i in range(len(normalized) - 2)}

    tri_a = _trigrams(text_a)
    tri_b = _trigrams(text_b)

    if not tri_a or not tri_b:
        return 0.0

    return len(tri_a & tri_b) / max(1, len(tri_a | tri_b))


def _section_similarity(text_a: str, text_b: str) -> float:
    """
    Multi-signal section similarity optimised for OCR text.

    Combines four complementary metrics:
    - SequenceMatcher: catches near-identical sequences
    - Token overlap: catches shared vocabulary
    - Character trigrams: robust to individual character OCR errors
    - Length balance: penalises wildly different section sizes
    """
    normalized_a = normalize_text(text_a)
    normalized_b = normalize_text(text_b)
    if not normalized_a or not normalized_b:
        return 0.0

    sequence_ratio = SequenceMatcher(None, normalized_a, normalized_b).ratio()
    token_ratio = _token_overlap_ratio(text_a, text_b)
    trigram_ratio = _char_trigram_similarity(text_a, text_b)
    length_ratio = _length_balance(text_a, text_b)

    # Equal weight to sequence, token, and trigram signals.
    # Trigrams are critical for handwriting OCR where character errors are common.
    return (
        (sequence_ratio * 0.30)
        + (token_ratio * 0.30)
        + (trigram_ratio * 0.30)
        + (length_ratio * 0.10)
    )


def _build_pointer(entry: dict):
    if entry.get("anchor_y") is None:
        return None

    return {
        "x": entry.get("anchor_x"),
        "y": entry.get("anchor_y"),
    }


def _build_region(entries: list) -> dict | None:
    """
    Compute the vertical bounding region (top/bottom Y) for a list of
    line entries.  Returns normalised 0-1 values so the frontend can
    draw highlight bands independent of image resolution.
    """
    y_values = [e["anchor_y"] for e in entries if e.get("anchor_y") is not None]
    if not y_values:
        return None

    # Add a small vertical padding (1.5% of page height each side)
    # so the band doesn't crop through the middle of text lines
    padding = 0.015
    return {
        "top": max(0.0, min(y_values) - padding),
        "bottom": min(1.0, max(y_values) + padding),
    }


def _best_line_anchor(section_a: dict, section_b: dict):
    best_match = None

    for entry_a in section_a["entries"]:
        for entry_b in section_b["entries"]:
            normalized_a = normalize_text(entry_a["text"])
            normalized_b = normalize_text(entry_b["text"])
            if not normalized_a or not normalized_b:
                continue

            score = SequenceMatcher(None, normalized_a, normalized_b).ratio()
            if best_match is None or score > best_match["score"]:
                best_match = {
                    "score": score,
                    "pointerA": _build_pointer(entry_a),
                    "pointerB": _build_pointer(entry_b),
                }

    return best_match or {"pointerA": None, "pointerB": None}


def get_matched_lines(page_a: dict, page_b: dict) -> List[dict]:
    sections_a = _split_into_sections(page_a)
    sections_b = _split_into_sections(page_b)

    if not sections_a or not sections_b:
        return []

    candidates = []
    for section_a in sections_a:
        for section_b in sections_b:
            score = _section_similarity(section_a["text"], section_b["text"])
            if score < 0.28:
                continue

            anchor = _best_line_anchor(section_a, section_b)

            candidates.append(
                {
                    "score": score,
                    "start_a": section_a["start"],
                    "end_a": section_a["end"],
                    "start_b": section_b["start"],
                    "end_b": section_b["end"],
                    "textA": section_a["text"],
                    "textB": section_b["text"],
                    "pointerA": anchor["pointerA"],
                    "pointerB": anchor["pointerB"],
                    "regionA": _build_region(section_a["entries"]),
                    "regionB": _build_region(section_b["entries"]),
                }
            )

    if not candidates:
        return []

    candidates.sort(
        key=lambda item: (item["score"], len(item["textA"]) + len(item["textB"])),
        reverse=True,
    )

    selected = []
    used_a = set()
    used_b = set()

    for item in candidates:
        section_range_a = set(range(item["start_a"], item["end_a"] + 1))
        section_range_b = set(range(item["start_b"], item["end_b"] + 1))

        if section_range_a & used_a or section_range_b & used_b:
            continue

        selected.append(
            {
                "textA": item["textA"],
                "textB": item["textB"],
                "pointerA": item["pointerA"],
                "pointerB": item["pointerB"],
                "regionA": item["regionA"],
                "regionB": item["regionB"],
                "score": round(item["score"], 3),
            }
        )
        used_a.update(section_range_a)
        used_b.update(section_range_b)

    if len(selected) >= 10:
        return selected[:15]

    fallback = []
    for item in candidates[: max(5, min(15, len(candidates)))]:
        fallback.append(
            {
                "textA": item["textA"],
                "textB": item["textB"],
                "pointerA": item["pointerA"],
                "pointerB": item["pointerB"],
                "regionA": item["regionA"],
                "regionB": item["regionB"],
                "score": round(item["score"], 3),
            }
        )

    return fallback


def select_top_page_matches(
    pages_a: List[dict],
    pages_b: List[dict],
    page_similarity_matrix: np.ndarray,
    max_matches: int = 10,
) -> List[dict]:
    """
    Select page-pair matches for the comparison view.

    Strategy (designed for assignment comparison):
    1. ALWAYS include same-page-number pairs (page 1 vs page 1, etc.)
       because assignments answer the same questions on matching pages.
    2. Fill remaining slots with the best cross-page matches.
    3. Adapt max_matches to document size — never drop a diagonal pair.

    This ensures the teacher ALWAYS sees the natural page-by-page comparison
    even if OCR noise makes those pairs score lower than cross-page pairs.
    """
    if page_similarity_matrix.size == 0:
        return []

    # Adapt max: at least enough slots for every same-page pair
    min_pages = min(len(pages_a), len(pages_b))
    effective_max = max(max_matches, min_pages)

    # ── Score every page pair (cheap — just reading the matrix) ──
    all_pairs = []
    diagonal_pairs = []

    for index_a, page_a in enumerate(pages_a):
        for index_b, page_b in enumerate(pages_b):
            similarity = float(page_similarity_matrix[index_a, index_b])
            pair = {
                "index_a": index_a,
                "index_b": index_b,
                "pageA": page_a.get("page_number", index_a + 1),
                "pageB": page_b.get("page_number", index_b + 1),
                "similarity": int(round(similarity * 100)),
                "imageA": page_a.get("image_url"),
                "imageB": page_b.get("image_url"),
            }
            all_pairs.append(pair)

            # Track same-page-number pairs (the diagonal of the matrix)
            if pair["pageA"] == pair["pageB"]:
                diagonal_pairs.append(pair)

    # ── Build selection: diagonal first, then best cross-page ──
    selected_keys = set()
    selected = []

    # 1. Always include all same-page-number pairs, sorted by page number
    for pair in sorted(diagonal_pairs, key=lambda p: p["pageA"]):
        key = (pair["index_a"], pair["index_b"])
        selected.append(pair)
        selected_keys.add(key)

    # 2. Fill remaining slots with best cross-page matches
    all_pairs.sort(key=lambda item: item["similarity"], reverse=True)
    for pair in all_pairs:
        if len(selected) >= effective_max:
            break
        key = (pair["index_a"], pair["index_b"])
        if key not in selected_keys and pair["similarity"] >= 5:
            selected.append(pair)
            selected_keys.add(key)

    # ── Run section-level matching on selected pairs ──
    results = []
    for pair in selected:
        if pair["similarity"] >= 2:
            matched_lines = get_matched_lines(
                pages_a[pair["index_a"]],
                pages_b[pair["index_b"]],
            )
        else:
            matched_lines = []

        results.append({
            "pageA": pair["pageA"],
            "pageB": pair["pageB"],
            "similarity": pair["similarity"],
            "imageA": pair["imageA"],
            "imageB": pair["imageB"],
            "matched_lines": matched_lines,
        })

    # Sort: same-page pairs first (by page number), then cross-page by similarity
    results.sort(key=lambda r: (
        0 if r["pageA"] == r["pageB"] else 1,
        r["pageA"] if r["pageA"] == r["pageB"] else 9999,
        -r["similarity"],
    ))

    logger.debug(
        f"Page matches: {len(diagonal_pairs)} diagonal + "
        f"{len(results) - len(diagonal_pairs)} cross-page = {len(results)} total"
    )
    return results


def build_document_pair_result(file_a: dict, file_b: dict) -> dict:
    pages_a = sorted(file_a.get("page_metadata") or [], key=lambda page: page.get("page_number", 1))
    pages_b = sorted(file_b.get("page_metadata") or [], key=lambda page: page.get("page_number", 1))

    page_similarity_matrix = compute_page_similarity_matrix(pages_a, pages_b)
    page_matches = select_top_page_matches(pages_a, pages_b, page_similarity_matrix)
    score = compute_document_similarity(page_similarity_matrix)

    logger.info(
        f"Built document pair result: {file_a['filename']} vs {file_b['filename']} - Overall Score: {score}"
    )

    return {
        "docA": file_a["filename"],
        "docB": file_b["filename"],
        "score": score,
        "page_matches": page_matches,
    }
