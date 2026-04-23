import re
from app.config.logging_config import get_logger

logger = get_logger(__name__)


# Only strip actual scanner watermarks — NOT dates or document content.
# Previous version stripped dates like 31/3/26, 15.06.2026 which are
# critical fields in internship/assignment forms.
WATERMARKS = [
    r"scanned\s+by\s+camscanner",
    r"scanned\s+with\s+camscanner",
    r"camscanner\s+scanned",
    r"image\s+extracted\s+by",
    r"shot\s+on\s+[a-zA-Z0-9_ ]+",
    r"sent\s+from\s+my\s+[a-zA-Z0-9_ ]+",
    r"captured\s+with\s+[a-zA-Z0-9_ ]+",
    r"device:\s*[a-zA-Z0-9_ ]+",
    r"created\s+using\s+[a-zA-Z0-9_ ]+",
    r"scanned\s+by",
    r"\bcamscanner\b",
]

_OCR_REPLACEMENTS = [
    (re.compile(r"\blogn\b", re.IGNORECASE), "log n"),
    (re.compile(r"\bn2\b", re.IGNORECASE), "n^2"),
    (re.compile(r"\bn3\b", re.IGNORECASE), "n^3"),
    (re.compile(r"\bo\(\s*nlogn\s*\)", re.IGNORECASE), "o(n log n)"),
    (re.compile(r"\bt\s*\(\s*n\s*\)", re.IGNORECASE), "t(n)"),
]

_MULTI_SPACE_PATTERN = re.compile(r"[ \t]+")
_MULTI_NEWLINE_PATTERN = re.compile(r"\n{3,}")


def remove_watermarks(text: str) -> str:
    if not text:
        return ""
    cleaned = text
    for pattern in WATERMARKS:
        cleaned = re.sub(pattern, " ", cleaned, flags=re.IGNORECASE)
    return cleaned


def normalize_ocr_issues(text: str) -> str:
    if not text:
        return ""
    result = text
    for pattern, replacement in _OCR_REPLACEMENTS:
        result = pattern.sub(replacement, result)
    return result


def normalize_text(text: str) -> str:
    """
    Normalize text for embeddings.

    Keeps: letters, digits, dates (/ and -), emails (@), math, punctuation.
    Removes: scanner watermarks, control characters, exotic unicode.
    Does NOT strip dates — they are meaningful form fields.
    """
    if not text:
        return ""

    result = remove_watermarks(text)
    result = normalize_ocr_issues(result)
    result = result.lower().replace("\r\n", "\n").replace("\r", "\n")

    # Broad allowlist — preserves dates, emails, registration numbers
    result = re.sub(r"[^a-z0-9\s\/\-\.\,\:\;\@\(\)\[\]\^\+\*\=\%\_]", " ", result)

    lines = []
    for line in result.split("\n"):
        lines.append(_MULTI_SPACE_PATTERN.sub(" ", line).strip())

    result = "\n".join(lines)
    result = _MULTI_NEWLINE_PATTERN.sub("\n\n", result)

    return result.strip()


def clean_text(text: str) -> str:
    return normalize_text(text)


def preprocess_text(text: str) -> str:
    logger.debug(f"Preprocessing text of length {len(text) if text else 0}")
    return normalize_text(text)