import os
import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config.logging_config import setup_logging, get_logger

from app.routers.analysis_router import router as analysis_router

# Initialize logging
setup_logging()
logger = get_logger(__name__)

app = FastAPI(
    title="Plagiarism Detection API",
    description="Academic plagiarism detection system",
    version="1.0.0",
)

os.makedirs("uploads", exist_ok=True)
app.mount("/api/static", StaticFiles(directory="uploads"), name="static")

origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis_router, prefix="/api/analysis", tags=["analysis"])


@app.on_event("startup")
async def preload_services():
    def _load():
        from app.config.ocr_config import pytesseract

        try:
            pytesseract.get_tesseract_version()
            logger.info("Tesseract ready.")
        except Exception:
            logger.error("Tesseract not configured properly")

    threading.Thread(target=_load, daemon=True).start()


@app.get("/")
def root():
    return {"message": "Plagiarism Detection API", "version": "1.0.0", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}
