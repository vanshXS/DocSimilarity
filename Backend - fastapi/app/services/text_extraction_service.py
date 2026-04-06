import os
from typing import Tuple

from PyPDF2 import PdfReader
from docx import Document
from PIL import Image
import pytesseract


def extract_text_from_pdf(file_path: str) -> str:
    reader = PdfReader(file_path)
    text = ""

    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"

    return text.strip()


def extract_text_from_docx(file_path: str) -> str:
    document = Document(file_path)
    paragraphs = [p.text for p in document.paragraphs if p.text.strip()]
    return "\n".join(paragraphs).strip()


def extract_text_from_image(file_path: str) -> str:
    image = Image.open(file_path)
    return pytesseract.image_to_string(image).strip()


def extract_text_from_txt(file_path: str) -> str:
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read().strip()


def extract_text(file_path: str, file_type: str) -> Tuple[str, str]:
    """
    Returns: (extracted_text, extraction_method)
    """
    if file_type == "pdf":
        return extract_text_from_pdf(file_path), "pdf-parser"

    if file_type == "docx":
        return extract_text_from_docx(file_path), "docx-parser"

    if file_type == "txt":
        return extract_text_from_txt(file_path), "txt-reader"

    if file_type in {"jpg", "jpeg", "png"}:
        return extract_text_from_image(file_path), "ocr-tesseract"

    raise ValueError(f"Unsupported file type: {file_type}")