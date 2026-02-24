from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

# Load model once (IMPORTANT)
model = SentenceTransformer("all-MiniLM-L6-v2")


def get_embeddings(texts: list[str]) -> np.ndarray:
    """
    Convert list of texts into embeddings.
    """
    if not texts:
        return np.array([])

    return model.encode(texts)


def compute_semantic_similarity_matrix(
    sentences_a: list[str],
    sentences_b: list[str]
) -> np.ndarray:
    """
    Returns similarity matrix (0-100).
    """
    if not sentences_a or not sentences_b:
        return np.array([])

    emb_a = get_embeddings(sentences_a)
    emb_b = get_embeddings(sentences_b)

    sim_matrix = cosine_similarity(emb_a, emb_b)

    return sim_matrix * 100

def compute_document_semantic_similarity(text_a: str, text_b: str) -> float:
    """
    Compute semantic similarity between two full documents.
    Returns value between 0-100.
    """
    if not text_a or not text_b:
        return 0.0

    emb_a = model.encode([text_a])
    emb_b = model.encode([text_b])

    sim = cosine_similarity(emb_a, emb_b)[0][0]

    return float(sim * 100)
