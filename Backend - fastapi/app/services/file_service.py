import os
from datetime import datetime
from uuid import uuid4
from typing import List

from fastapi import UploadFile

# Root folder where all uploads are stored
UPLOAD_ROOT = "uploads/sessions"

# FIX BUG-3: Added "txt" to match what the Upload UI advertises
ALLOWED_EXTENSIONS = {"pdf", "docx", "jpg", "jpeg", "png", "txt"}


def _get_file_extension(filename: str) -> str:
    """
    Extract and normalize file extension.
    """
    return filename.split(".")[-1].lower()


def save_files_to_disk(session_id: str, files: List[UploadFile]) -> None:
    """
    Save uploaded files to disk under a session-specific folder.

    Folder structure:
    uploads/sessions/<session_id>/<filename>
    """
    session_dir = os.path.join(UPLOAD_ROOT, session_id)
    os.makedirs(session_dir, exist_ok=True)

    for file in files:
        # Sanitise filename to prevent path traversal
        safe_filename = os.path.basename(file.filename)
        extension = _get_file_extension(safe_filename)

        if extension not in ALLOWED_EXTENSIONS:
            allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
            raise ValueError(
                f"Unsupported file type for '{safe_filename}'. "
                f"Allowed types are: {allowed}"
            )

        file_path = os.path.join(session_dir, safe_filename)

        # Save file content
        content = file.file.read()
        with open(file_path, "wb") as buffer:
            buffer.write(content)

        # Reset seek so file can be read again if needed
        file.file.seek(0)


def build_file_documents(session_id: str, files: List[UploadFile]) -> List[dict]:
    """
    Build MongoDB documents for uploaded files.

    Each file becomes ONE document in `analysis_files` collection.
    """
    file_documents = []

    for file in files:
        safe_filename = os.path.basename(file.filename)
        extension = _get_file_extension(safe_filename)

        file_documents.append({
            "file_id": str(uuid4()),
            "session_id": session_id,
            "filename": safe_filename,
            "file_type": extension,
            "uploaded_at": datetime.utcnow(),

            # Filled later during processing
            "extracted_text": None,
            "extraction_method": None
        })

    return file_documents