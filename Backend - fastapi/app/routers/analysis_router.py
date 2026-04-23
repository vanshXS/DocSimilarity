import mimetypes
import os

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from typing import List

from app.schemas.analysis_schema import CreateSessionRequest, CreateSessionResponse
from app.services.analysis_service import (
    create_session,
    delete_multiple_sessions,
    delete_session_data,
    get_dashboard_stats,
    get_file_by_id,
    get_files_by_session,
    get_results_by_session,
    get_section_results_by_session,
    get_session_by_id,
    list_sessions,
    save_file_metadata,
    update_extracted_text,
    update_preprocessed_text,
)
from app.services.file_service import build_file_documents, save_files_to_disk
from app.services.nlp_service import preprocess_text
from app.services.pipeline_service import process_session_background_pipeline, run_similarity_pipeline
from app.services.text_extraction_service import extract_text

router = APIRouter()


def _has_complete_layout_metadata(file_doc: dict) -> bool:
    pages = file_doc.get("page_metadata") or []
    if not pages:
        return False

    first_page = pages[0]
    file_type = (file_doc.get("file_type") or "").lower()
    if file_type in {"pdf", "jpg", "jpeg", "png"}:
        return bool(first_page.get("image_url") and first_page.get("lines"))

    return bool(first_page.get("lines"))


def process_session_background(session_id: str):
    process_session_background_pipeline(session_id)


@router.get("/dashboard/stats")
def get_analytics_stats():
    try:
        return get_dashboard_stats()
    except Exception:
        return {
            "total_sessions": 0,
            "total_documents": 0,
            "high_risk_cases": 0,
            "average_similarity": 0,
        }


@router.post("/session", response_model=CreateSessionResponse)
def create_analysis_session(request: CreateSessionRequest):
    if not request.subject.strip():
        raise HTTPException(status_code=400, detail="Subject is required")

    session = create_session(subject=request.subject.strip(), title=request.title)
    return CreateSessionResponse(
        session_id=session.session_id,
        subject=session.subject,
        title=session.title,
        status=session.status,
        created_at=session.created_at,
    )


@router.get("/sessions")
def list_analysis_sessions():
    return {"sessions": list_sessions()}


@router.post("/{session_id}/upload")
def upload_assignments(session_id: str, files: List[UploadFile] = File(...)):
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    try:
        save_files_to_disk(session_id, files)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    file_docs = build_file_documents(session_id, files)
    save_file_metadata(file_docs)

    return {
        "message": "Files uploaded successfully",
        "session_id": session_id,
        "files": [
            {
                "file_id": file_doc["file_id"],
                "filename": file_doc["filename"],
                "file_type": file_doc["file_type"],
            }
            for file_doc in file_docs
        ],
    }


@router.get("/{session_id}/files")
def list_files_of_session(session_id: str):
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"session_id": session_id, "files": get_files_by_session(session_id)}


@router.post("/{session_id}/auto-process")
def trigger_auto_process(session_id: str, background_tasks: BackgroundTasks):
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    background_tasks.add_task(process_session_background, session_id)
    return {
        "message": "Analysis started in background",
        "session_id": session_id,
        "status": "PROCESSING",
    }


@router.get("/{session_id}/status")
def check_session_status(session_id: str):
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "session_id": session_id,
        "status": session.get("status"),
        "current_step": session.get("current_step"),
        "progress_percent": session.get("progress_percent", 0),
        "subject": session.get("subject"),
        "title": session.get("title"),
        "created_at": session.get("created_at"),
    }


@router.delete("/{session_id}")
def delete_assignment_session(session_id: str):
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    delete_session_data(session_id)
    return {"message": "Session deleted successfully", "session_id": session_id}


@router.post("/bulk-delete")
def bulk_delete_sessions(request: dict):
    session_ids = request.get("session_ids", [])
    if not session_ids:
        raise HTTPException(status_code=400, detail="No session IDs provided")

    delete_multiple_sessions(session_ids)
    return {"message": f"Successfully deleted {len(session_ids)} sessions", "count": len(session_ids)}


@router.get("/{session_id}/results")
def get_session_results(session_id: str):
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"pairs": get_results_by_session(session_id)}


@router.get("/{session_id}/section-results")
def get_session_section_results(session_id: str):
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "session_id": session_id,
        "section_results": get_section_results_by_session(session_id),
    }


@router.get("/{session_id}/file/{file_id}/page/{page_number}/image")
def get_file_page_image(session_id: str, file_id: str, page_number: int):
    from fastapi.responses import FileResponse

    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    file_doc = get_file_by_id(file_id)
    if not file_doc or file_doc.get("session_id") != session_id:
        raise HTTPException(status_code=404, detail="File not found")

    images_dir = os.path.join("uploads", "sessions", session_id, "images", file_id)
    candidate_paths = [
        os.path.join(images_dir, f"page_{page_number}.png"),
        os.path.join(images_dir, f"page_{page_number}.jpg"),
        os.path.join(images_dir, f"page_{page_number}.jpeg"),
    ]

    image_path = next((path for path in candidate_paths if os.path.exists(path)), None)
    if not image_path:
        raise HTTPException(status_code=404, detail="Page image not found")

    media_type, _ = mimetypes.guess_type(image_path)
    return FileResponse(image_path, media_type=media_type or "application/octet-stream")


@router.get("/{session_id}/file/{file_id}/content")
def get_file_content(session_id: str, file_id: str):
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    file_doc = get_file_by_id(file_id)
    if not file_doc or file_doc.get("session_id") != session_id:
        raise HTTPException(status_code=404, detail="File not found")

    pages = file_doc.get("page_metadata") or []
    if pages:
        normalized_pages = []
        for page in sorted(pages, key=lambda item: item.get("page_number", 1)):
            lines = []
            for line in page.get("lines") or []:
                if isinstance(line, str):
                    text = line.strip()
                    if text:
                        lines.append({"text": text, "anchor_x": None, "anchor_y": None})
                else:
                    text = str(line.get("text", "")).strip()
                    if text:
                        lines.append(
                            {
                                "text": text,
                                "anchor_x": line.get("anchor_x"),
                                "anchor_y": line.get("anchor_y"),
                            }
                        )

            normalized_pages.append(
                {
                    "page_number": page.get("page_number", 1),
                    "image_url": page.get("image_url"),
                    "lines": lines,
                }
            )
        pages = normalized_pages
    else:
        pages = [
            {
                "page_number": 1,
                "image_url": None,
                "lines": [
                    {"text": line, "anchor_x": None, "anchor_y": None}
                    for line in (file_doc.get("extracted_text", "") or "").splitlines()
                    if line.strip()
                ],
            }
        ]

    return {
        "file_id": file_doc["file_id"],
        "filename": file_doc["filename"],
        "file_type": file_doc.get("file_type"),
        "pages": pages,
    }


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

    for file_doc in files:
        if file_doc.get("extracted_text") and _has_complete_layout_metadata(file_doc):
            continue

        file_path = os.path.join(session_dir, file_doc["filename"])
        if not os.path.exists(file_path):
            continue

        try:
            text, page_meta, method = extract_text(
                file_path, file_doc["file_type"], session_id, file_doc["file_id"]
            )
            update_extracted_text(file_doc["file_id"], text, method, page_meta)
            extracted_summary.append(
                {
                    "filename": file_doc["filename"],
                    "text_length": len(text),
                    "method": method,
                }
            )
        except Exception as exc:
            extracted_summary.append({"filename": file_doc["filename"], "error": str(exc)})

    return {
        "message": "Text extraction completed",
        "session_id": session_id,
        "files_processed": extracted_summary,
    }


@router.post("/{session_id}/nlp-process")
def run_nlp_for_session(session_id: str):
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    files = get_files_by_session(session_id)
    processed_summary = []

    for file_doc in files:
        raw_text = file_doc.get("extracted_text")
        if raw_text is None or file_doc.get("preprocessed_text") is not None:
            continue

        try:
            preprocessed_text = preprocess_text(raw_text)
            update_preprocessed_text(file_doc["file_id"], preprocessed_text)
            processed_summary.append(
                {
                    "filename": file_doc["filename"],
                    "processed_length": len(preprocessed_text.split()),
                }
            )
        except Exception as exc:
            processed_summary.append({"filename": file_doc["filename"], "error": str(exc)})

    return {
        "message": "NLP preprocessing completed",
        "session_id": session_id,
        "files_processed": processed_summary,
    }


@router.post("/{session_id}/similarity")
def run_similarity(session_id: str):
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    files = [file_doc for file_doc in get_files_by_session(session_id) if file_doc.get("extracted_text")]
    pairs = run_similarity_pipeline(session_id, files)

    return {
        "message": "Similarity analysis completed",
        "pairs": pairs,
    }
