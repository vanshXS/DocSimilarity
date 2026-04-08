from fastapi import APIRouter, UploadFile, File, HTTPException, Query, BackgroundTasks
from typing import List, Optional
import os
import traceback
import shutil

# Schema imports
from app.schemas.analysis_schema import (
    CreateSessionRequest,
    CreateSessionResponse,
)

# Service imports - Analysis
from app.services.analysis_service import (
    create_session,
    get_session_by_id,
    list_sessions,
    save_file_metadata,
    get_files_by_session,
    update_extracted_text,
    update_preprocessed_text,
    get_existing_similarity_pairs,
    save_similarity_result,
    get_results_by_session,
    save_section_similarity,
    save_highlight,
    get_section_results_by_session,
    get_highlights_by_session,
    get_highlights_for_pair,
    update_session_status,
    get_dashboard_stats,
)

# Service imports - Other
from app.services.file_service import (
    save_files_to_disk,
    build_file_documents,
)
from app.services.text_extraction_service import extract_text
from app.services.nlp_service import preprocess_text
from app.services.similarity_service import (
    compute_pairwise_similarity,
    classify_similarity,
    compute_sections_similarities,
)
from app.services.section_service import split_into_sections
from app.services.highlight_service import (
    split_into_sentences,
    sentence_similarity,
)
from app.services.embedding_service import (
    compute_semantic_similarity_matrix,
    compute_document_semantic_similarity,
)


router = APIRouter()


# ============================================================================
# BACKGROUND TASK - FULL PIPELINE
# ============================================================================

def process_session_background(session_id: str):
    """
    Orchestrates the entire analysis pipeline in the background.

    Stages:
    1. Status → PROCESSING
    2. Text Extraction
    3. NLP Preprocessing
    4. Document Similarity (TF-IDF 50% + Semantic 50%)
    5. Sentence-level Highlight Detection (semantic similarity matrix)
    6. Status → COMPLETED / FAILED
    """
    print(f"--- [Background] Starting pipeline for {session_id} ---")

    try:
        # Stage 1
        update_session_status(session_id, "PROCESSING")

        # Stage 2: Text Extraction
        session_dir = os.path.join("uploads/sessions", session_id)
        files = get_files_by_session(session_id)

        for file in files:
            if file.get("extracted_text"):
                continue

            file_path = os.path.join(session_dir, file["filename"])
            if os.path.exists(file_path):
                try:
                    text, method = extract_text(file_path, file["file_type"])
                    update_extracted_text(file["file_id"], text, method)
                except Exception as e:
                    print(f"[Background] Extraction failed for {file['filename']}: {e}")

        # Stage 3: NLP Preprocessing
        files = get_files_by_session(session_id)

        for file in files:
            if file.get("preprocessed_text"):
                continue

            raw_text = file.get("extracted_text")
            if raw_text:
                try:
                    processed = preprocess_text(raw_text)
                    update_preprocessed_text(file["file_id"], processed)
                except Exception as e:
                    print(f"[Background] NLP failed for {file['filename']}: {e}")

        # Stage 4 & 5: Similarity + Highlighting
        processed_files = [
            f for f in get_files_by_session(session_id)
            if f.get("preprocessed_text")
        ]
        existing_pairs = get_existing_similarity_pairs(session_id)

        if len(processed_files) >= 2:
            for i in range(len(processed_files)):
                for j in range(i + 1, len(processed_files)):
                    a = processed_files[i]
                    b = processed_files[j]

                    # Normalize order (smaller file_id first)
                    if a["file_id"] > b["file_id"]:
                        a, b = b, a

                    if (a["file_id"], b["file_id"]) in existing_pairs:
                        continue

                    # Hybrid similarity: TF-IDF 50% + Semantic 50%
                    tfidf_score = compute_pairwise_similarity(
                        a["preprocessed_text"],
                        b["preprocessed_text"]
                    )
                    semantic_score = compute_document_semantic_similarity(
                        a.get("extracted_text", ""),
                        b.get("extracted_text", "")
                    )
                    score = 0.5 * tfidf_score + 0.5 * semantic_score
                    level = classify_similarity(score)
                    save_similarity_result(session_id, a, b, score, level)
                    existing_pairs.add((a["file_id"], b["file_id"]))

                    
                    if score >= 55:
                        try:
                            sa_list = split_into_sentences(a.get("extracted_text", ""))
                            sb_list = split_into_sentences(b.get("extracted_text", ""))

                            if sa_list and sb_list:
                                sim_matrix = compute_semantic_similarity_matrix(
                                    sa_list,
                                    sb_list
                                )

                                for si in range(len(sa_list)):
                                    for sj in range(len(sb_list)):
                                        s_score = sim_matrix[si][sj]
                                        if s_score >= 70:
                                            save_highlight(
                                                session_id,
                                                a["file_id"],
                                                b["file_id"],
                                                sa_list[si],
                                                sb_list[sj],
                                                float(s_score)
                                            )
                        except Exception as e:
                            print(f"[Background] Embedding highlight error: {e}")

        # Stage 6: Cleanup & Done
        try:
            if os.path.exists(session_dir):
                shutil.rmtree(session_dir)
                print(f"--- [Background] Cleaned up session files for {session_id} ---")
        except Exception as cleanup_error:
            print(f"[Background] Cleanup warning for {session_id}: {cleanup_error}")

        update_session_status(session_id, "COMPLETED")
        print(f"--- [Background] Pipeline COMPLETED for {session_id} ---")

    except Exception as e:
        print(f"--- [Background] Pipeline FAILED for {session_id}: {traceback.format_exc()} ---")
        update_session_status(session_id, "FAILED")


# ============================================================================
# DASHBOARD API
# NOTE: Must be registered BEFORE /{session_id}/... routes to avoid
# FastAPI capturing "dashboard" as a session_id path param.
# ============================================================================

@router.get("/dashboard/stats")
def get_analytics_stats():
    try:
        return get_dashboard_stats()
    except Exception as e:
        print(f"Stats Error: {e}")
        return {
            "total_sessions": 0,
            "total_documents": 0,
            "high_risk_cases": 0,
            "average_similarity": 0
        }


# ============================================================================
# SESSION MANAGEMENT
# ============================================================================

@router.post("/session", response_model=CreateSessionResponse)
def create_analysis_session(request: CreateSessionRequest):
    if not request.subject.strip():
        raise HTTPException(status_code=400, detail="Subject is required")

    session = create_session(
        subject=request.subject.strip(),
        title=request.title
    )

    return CreateSessionResponse(
        session_id=session.session_id,
        subject=session.subject,
        title=session.title,
        status=session.status,
        created_at=session.created_at
    )


@router.get("/sessions")
def list_analysis_sessions():
    return {"sessions": list_sessions()}


# ============================================================================
# FILE MANAGEMENT
# ============================================================================

@router.post("/{session_id}/upload")
def upload_assignments(
    session_id: str,
    files: List[UploadFile] = File(...),
):
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    try:
        save_files_to_disk(session_id, files)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    file_docs = build_file_documents(session_id, files)
    save_file_metadata(file_docs)

    return {
        "message": "Files uploaded successfully",
        "session_id": session_id,
        "files": [
            {
                "file_id": f["file_id"],
                "filename": f["filename"],
                "file_type": f["file_type"],
            }
            for f in file_docs
        ],
    }


@router.get("/{session_id}/files")
def list_files_of_session(session_id: str):
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "session_id": session_id,
        "files": get_files_by_session(session_id)
    }


# ============================================================================
# AUTOMATION
# ============================================================================

@router.post("/{session_id}/auto-process")
def trigger_auto_process(
    session_id: str,
    background_tasks: BackgroundTasks
):
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    background_tasks.add_task(process_session_background, session_id)

    return {
        "message": "Analysis started in background",
        "session_id": session_id,
        "status": "PROCESSING"
    }


@router.get("/{session_id}/status")
def check_session_status(session_id: str):
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "session_id": session_id,
        "status": session.get("status"),
        "subject": session.get("subject"),
        "title": session.get("title"),
        "created_at": session.get("created_at")
    }


# ============================================================================
# RESULTS
# ============================================================================

@router.get("/{session_id}/results")
def get_session_results(session_id: str):
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "session_id": session_id,
        "results": get_results_by_session(session_id),
    }


@router.get("/{session_id}/section-results")
def get_session_section_results(session_id: str):
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "session_id": session_id,
        "section_results": get_section_results_by_session(session_id),
    }


@router.get("/{session_id}/highlights")
def get_session_highlights(
    session_id: str,
    file_a_id: Optional[str] = Query(default=None),
    file_b_id: Optional[str] = Query(default=None),
):
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if file_a_id and file_b_id:
        highlights = get_highlights_for_pair(session_id, file_a_id, file_b_id)
    else:
        highlights = get_highlights_by_session(session_id)

    return {
        "session_id": session_id,
        "highlights": highlights,
    }


# ============================================================================
# MANUAL / DEBUG ENDPOINTS
# ============================================================================

@router.post("/{session_id}/extract-text")
def extract_text_for_session(session_id: str):
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    files = get_files_by_session(session_id)
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    session_dir = os.path.join("uploads/sessions", session_id)
    extracted_summary = []

    for file in files:
        if file.get("extracted_text"):
            continue

        file_path = os.path.join(session_dir, file["filename"])
        if not os.path.exists(file_path):
            continue

        try:
            text, method = extract_text(file_path, file["file_type"])
            update_extracted_text(file["file_id"], text, method)
            extracted_summary.append({
                "filename": file["filename"],
                "text_length": len(text),
                "method": method,
            })
        except Exception as e:
            extracted_summary.append({
                "filename": file["filename"],
                "error": str(e)
            })

    return {
        "message": "Text extraction completed",
        "session_id": session_id,
        "files_processed": extracted_summary
    }


@router.post("/{session_id}/nlp-process")
def run_nlp_for_session(session_id: str):
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    files = get_files_by_session(session_id)
    processed_summary = []

    for file in files:
        raw_text = file.get("extracted_text")
        if not raw_text or file.get("preprocessed_text"):
            continue

        try:
            preprocessed_text = preprocess_text(raw_text)
            update_preprocessed_text(file["file_id"], preprocessed_text)
            processed_summary.append({
                "filename": file["filename"],
                "processed_length": len(preprocessed_text.split())
            })
        except Exception as e:
            processed_summary.append({
                "filename": file["filename"],
                "error": str(e)
            })

    return {
        "message": "NLP preprocessing completed",
        "session_id": session_id,
        "files_processed": processed_summary
    }


@router.post("/{session_id}/similarity")
def run_similarity(session_id: str):
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    files = [
        f for f in get_files_by_session(session_id)
        if f.get("preprocessed_text")
    ]

    if len(files) < 2:
        raise HTTPException(
            status_code=400,
            detail="At least two processed files required"
        )

    existing_pairs = get_existing_similarity_pairs(session_id)
    new_comparisons = []

    for i in range(len(files)):
        for j in range(i + 1, len(files)):
            a, b = files[i], files[j]

            if a["file_id"] > b["file_id"]:
                a, b = b, a

            if (a["file_id"], b["file_id"]) in existing_pairs:
                continue

            tfidf_score = compute_pairwise_similarity(
                a["preprocessed_text"],
                b["preprocessed_text"]
            )
            semantic_score = compute_document_semantic_similarity(
                a.get("extracted_text", ""),
                b.get("extracted_text", "")
            )
            score = 0.5 * tfidf_score + 0.5 * semantic_score
            level = classify_similarity(score)
            save_similarity_result(session_id, a, b, score, level)
            existing_pairs.add((a["file_id"], b["file_id"]))

            new_comparisons.append({
                "file_a": a["filename"],
                "file_b": b["filename"],
                "similarity": round(score, 2),
                "level": level
            })

            # FIX BUG-7: Aligned threshold with classify_similarity MEDIUM (>=55)
            if score >= 55:
                try:
                    sa_list = split_into_sentences(a.get("extracted_text", ""))
                    sb_list = split_into_sentences(b.get("extracted_text", ""))

                    if sa_list and sb_list:
                        sim_matrix = compute_semantic_similarity_matrix(
                            sa_list,
                            sb_list
                        )

                        for si in range(len(sa_list)):
                            for sj in range(len(sb_list)):
                                s_score = sim_matrix[si][sj]
                                if s_score >= 70:
                                    save_highlight(
                                        session_id,
                                        a["file_id"],
                                        b["file_id"],
                                        sa_list[si],
                                        sb_list[sj],
                                        float(s_score)
                                    )
                except Exception as e:
                    print(f"Embedding highlight error: {e}")

    return {
        "message": "Similarity analysis completed",
        "session_id": session_id,
        "new_comparisons": new_comparisons,
        "all_results": get_results_by_session(session_id)
    }