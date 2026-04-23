import os
from typing import List

import numpy as np
from sentence_transformers import SentenceTransformer

from app.services.nlp_service import normalize_text

# MiniLM: 80MB, 5x faster than mpnet, more than sufficient for plagiarism detection
MODEL_NAME = "all-MiniLM-L6-v2"
MODEL_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "models", "minilm")
)


def _load_model() -> SentenceTransformer:
    if os.path.isdir(MODEL_DIR) and os.listdir(MODEL_DIR):
        print(f"[OK] Embedding model loaded from: {MODEL_DIR}")
        return SentenceTransformer(MODEL_DIR)
    print(f"[DOWNLOADING] {MODEL_NAME} (~80MB, first time only)...")
    os.makedirs(MODEL_DIR, exist_ok=True)
    model = SentenceTransformer(MODEL_NAME)
    model.save(MODEL_DIR)
    print(f"[OK] Saved to {MODEL_DIR} - instant load from now on")
    return model


_EMBEDDING_MODEL: SentenceTransformer = _load_model()


def get_embeddings(chunks: List[str]) -> np.ndarray:
    if not chunks:
        return np.empty((0, 0), dtype=np.float32)
    normalized = [normalize_text(chunk) or " " for chunk in chunks]
    return _EMBEDDING_MODEL.encode(
        normalized,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )


def compute_similarity_matrix_from_embeddings(
    embeddings_a: np.ndarray, embeddings_b: np.ndarray
) -> np.ndarray:
    if embeddings_a.size == 0 or embeddings_b.size == 0:
        return np.empty((embeddings_a.shape[0], embeddings_b.shape[0]), dtype=np.float32)
    return np.clip(np.matmul(embeddings_a, embeddings_b.T), 0.0, 1.0)


def compute_similarity_matrix(chunks_a: List[str], chunks_b: List[str]) -> np.ndarray:
    if not chunks_a or not chunks_b:
        return np.empty((len(chunks_a), len(chunks_b)), dtype=np.float32)
    ea = get_embeddings(chunks_a)
    eb = get_embeddings(chunks_b)
    if ea.size == 0 or eb.size == 0:
        return np.empty((len(chunks_a), len(chunks_b)), dtype=np.float32)
    return compute_similarity_matrix_from_embeddings(ea, eb)