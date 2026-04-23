import os
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

import fitz
import pytesseract
from docx import Document
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

# MUST be imported before any pytesseract call — sets Windows exe path
import app.config.ocr_config  # noqa: F401

from app.config.logging_config import get_logger
from app.services.nlp_service import normalize_text

logger = get_logger(__name__)

# 1 = safe on any laptop. Tesseract uses C-level threads internally per page.
# 4 workers was causing system freeze (4 × 1.5GB RAM = crash).
MAX_PAGE_WORKERS = 3

# psm 6 = assume uniform block of text — best for assignment/form pages
# psm 3 = fully automatic segmentation — fallback for mixed layouts
TESSERACT_CONFIG_PRIMARY = "--oem 3 --psm 6 -l eng"
TESSERACT_CONFIG_FALLBACK = "--oem 3 --psm 3 -l eng"


def preprocess(image: Image.Image) -> Image.Image:
    """
    Prepare image for Tesseract OCR.

    Optimised for phone-photographed handwritten A4 sheets:
    - AutoContrast adapts to each image's lighting conditions
    - Sharpening restores text edges blurred by phone cameras
    - Higher upscale target (1500px) gives Tesseract more pixels to work with
    - Median filter removes camera sensor noise without destroying strokes
    - NO hard binarization — Tesseract's internal Otsu is more accurate
    """
    gray = ImageOps.grayscale(image)

    # Upscale small images — handwriting needs high resolution
    width, height = gray.size
    if min(width, height) < 1500:
        scale = 1500 / min(width, height)
        gray = gray.resize((int(width * scale), int(height * scale)), Image.LANCZOS)

    # AutoContrast adapts to the actual brightness range of this photo
    # cutoff=1 trims the darkest/lightest 1% — reduces shadow artefacts
    gray = ImageOps.autocontrast(gray, cutoff=1)

    # Modest fixed contrast boost on top of autocontrast
    gray = ImageEnhance.Contrast(gray).enhance(1.5)

    # Sharpen edges — critical for handwriting captured by phone cameras
    gray = ImageEnhance.Sharpness(gray).enhance(2.0)

    # Light denoise — 3×3 median removes sensor grain without harming strokes
    gray = gray.filter(ImageFilter.MedianFilter(size=3))

    return gray


def _safe_ratio(value: float, total: float):
    if total <= 0:
        return None
    return round(float(value) / float(total), 6)


def _run_tesseract(processed: Image.Image, config: str):
    """
    Run Tesseract with a specific config and return structured line results.
    Separated from ocr_page so we can retry with different PSM modes.
    """
    data = pytesseract.image_to_data(
        processed,
        config=config,
        output_type=pytesseract.Output.DICT,
    )

    image_width, image_height = processed.size
    lines_map = defaultdict(list)
    total_items = len(data["text"])

    for index in range(total_items):
        text = str(data["text"][index]).strip()
        conf = int(data["conf"][index])

        # conf = -1 means non-word region (whitespace/image area) — always skip
        # conf >= 0 but < 10 is usually noise from diagrams/doodles
        # Lowered from 20→10 to capture more handwritten text
        if not text or conf < 10:
            continue

        key = (
            data["block_num"][index],
            data["par_num"][index],
            data["line_num"][index],
        )
        lines_map[key].append(
            {
                "text": text,
                "x": float(data["left"][index]),
                "y": float(data["top"][index]),
                "w": float(data["width"][index]),
                "h": float(data["height"][index]),
            }
        )

    lines = []
    for words in lines_map.values():
        ordered_words = sorted(words, key=lambda word: word["x"])
        line_text = " ".join(word["text"] for word in ordered_words).strip()

        if not normalize_text(line_text):
            continue

        min_x = min(word["x"] for word in ordered_words)
        min_y = min(word["y"] for word in ordered_words)
        max_x = max(word["x"] + word["w"] for word in ordered_words)
        max_y = max(word["y"] + word["h"] for word in ordered_words)

        center_x = (min_x + max_x) / 2.0
        center_y = (min_y + max_y) / 2.0

        lines.append(
            {
                "text": line_text,
                "anchor_x": _safe_ratio(center_x, image_width),
                "anchor_y": _safe_ratio(center_y, image_height),
            }
        )

    return lines


def ocr_page(image: Image.Image):
    """
    Run Tesseract on one page image with automatic fallback.

    Strategy:
    1. Try PSM 6 (uniform block) — best for structured assignment pages
    2. If result is very sparse (< 3 lines), retry with PSM 3 (fully automatic)
       Some phone-photo PDFs have mixed layouts that PSM 6 misreads
    3. Return whichever produced more text
    """
    processed = preprocess(image)

    # Primary attempt with structured layout mode
    lines = _run_tesseract(processed, TESSERACT_CONFIG_PRIMARY)

    # If too sparse, the page may have a layout PSM 6 can't handle
    # (e.g., rotated text, mixed columns, or very messy handwriting)
    if len(lines) < 3:
        logger.debug(
            f"PSM 6 produced only {len(lines)} lines — retrying with PSM 3 (auto)"
        )
        alt_lines = _run_tesseract(processed, TESSERACT_CONFIG_FALLBACK)
        if len(alt_lines) > len(lines):
            logger.debug(
                f"PSM 3 produced {len(alt_lines)} lines — using fallback result"
            )
            lines = alt_lines

    return lines


def _save_page_image(session_id, file_id, page_number, image_obj):
    path = os.path.join("uploads", "sessions", session_id, "images", file_id)
    os.makedirs(path, exist_ok=True)

    file_path = os.path.join(path, f"page_{page_number}.png")
    if isinstance(image_obj, Image.Image):
        image_obj.convert("RGB").save(file_path, format="PNG")
    else:
        image_obj.save(file_path)

    return f"/api/analysis/{session_id}/file/{file_id}/page/{page_number}/image"


def _process_one_page(args):
    """Single page processor — runs inside ThreadPoolExecutor."""
    page_number, pix, session_id, file_id = args
    image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    image_url = _save_page_image(session_id, file_id, page_number, image)
    lines = ocr_page(image)
    return {
        "page_number": page_number,
        "image_url": image_url,
        "lines": lines,
    }


def extract_text_from_pdf(file_path, session_id, file_id):
    logger.info(f"Extracting PDF: {os.path.basename(file_path)}")
    document = fitz.open(file_path)

    # Render at 200 DPI — higher quality for handwritten text from phone photos
    # 150 DPI was too low for handwriting recognition
    zoom = 200 / 72.0
    matrix = fitz.Matrix(zoom, zoom)

    page_args = []
    for page_number, page in enumerate(document, start=1):
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        page_args.append((page_number, pix, session_id, file_id))

    document.close()

    page_metadata = []
    with ThreadPoolExecutor(max_workers=MAX_PAGE_WORKERS) as executor:
        futures = {
            executor.submit(_process_one_page, args): args[0]
            for args in page_args
        }
        for future in as_completed(futures):
            page_number = futures[future]
            try:
                result = future.result()
                page_metadata.append(result)
                logger.info(f"  Page {page_number}: {len(result['lines'])} lines")
            except Exception as e:
                logger.error(f"  Page {page_number} failed: {e}")

    page_metadata.sort(key=lambda p: p["page_number"])
    text = "\n\n".join(
        "\n".join(line["text"] for line in p["lines"])
        for p in page_metadata
    )
    logger.info(f"PDF done: {len(page_metadata)} pages")
    return text, page_metadata, "tesseract-line-grouped"


def extract_text_from_image(file_path, session_id, file_id):
    logger.info(f"Extracting image: {os.path.basename(file_path)}")
    with Image.open(file_path) as opened_image:
        image = opened_image.convert("RGB")
        page_metadata = [
            {
                "page_number": 1,
                "image_url": _save_page_image(session_id, file_id, 1, image),
                "lines": ocr_page(image),
            }
        ]

    text = "\n".join(line["text"] for line in page_metadata[0]["lines"])
    return text, page_metadata, "tesseract-line-grouped"


def extract_text_from_docx(file_path):
    logger.info(f"Extracting DOCX: {os.path.basename(file_path)}")
    document = Document(file_path)

    lines = []
    for paragraph in document.paragraphs:
        text = paragraph.text.strip()
        if normalize_text(text):
            lines.append({"text": text, "anchor_x": None, "anchor_y": None})

    page_metadata = [{"page_number": 1, "image_url": None, "lines": lines}]
    text = "\n".join(line["text"] for line in lines)
    return text, page_metadata, "docx-paragraphs"


def extract_text_from_txt(file_path):
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        raw_text = f.read()

    lines = [
        {"text": line.strip(), "anchor_x": None, "anchor_y": None}
        for line in raw_text.splitlines()
        if normalize_text(line)
    ]
    page_metadata = [{"page_number": 1, "image_url": None, "lines": lines}]
    text = "\n".join(line["text"] for line in lines)
    return text, page_metadata, "plain-text-lines"


def extract_text(file_path, file_type, session_id, file_id):
    ext = file_type.lower()
    if ext == "pdf":
        return extract_text_from_pdf(file_path, session_id, file_id)
    if ext in {"jpg", "jpeg", "png"}:
        return extract_text_from_image(file_path, session_id, file_id)
    if ext == "docx":
        return extract_text_from_docx(file_path)
    if ext == "txt":
        return extract_text_from_txt(file_path)
    raise ValueError(f"Unsupported file type: {file_type}")