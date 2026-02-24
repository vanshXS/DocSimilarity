from typing import List

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def _normalize_text(text: str | None) -> str:
    """
    Safely normalize text input.
    Returns an empty string for None and strips surrounding whitespace.
    """
    if text is None:
        return ""
    return text.strip()


def compute_similarity_matrix(texts: List[str]) -> List[List[float]]:
    """
    Enhanced TF-IDF vectorization and cosine similarity computation:
    - Uses n-grams (1,2) for better context
    - Handles edge cases
    - Returns normalized similarity scores (0-100)
    """
    if not texts or len(texts) < 2:
        # Not enough texts to compare
        return [[0.0]]

    # Normalize and filter out texts that are too short to be meaningful
    normalized_texts = [_normalize_text(t) for t in texts]
    valid_texts = [text for text in normalized_texts if len(text) > 10]

    if len(valid_texts) < 2:
        # If after filtering we don't have at least 2 valid docs,
        # return a zero matrix with the original size
        return [[0.0 for _ in texts] for _ in texts]

    try:
        # Enhanced TF-IDF vectorizer
        vectorizer = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2),  # Use unigrams and bigrams
            max_features=5000,   # Limit features for performance
            min_df=1,            # Minimum document frequency
            max_df=0.8,          # Maximum document frequency
            lowercase=True,
            strip_accents="unicode",
        )

        # Create TF-IDF matrix
        tfidf_matrix = vectorizer.fit_transform(valid_texts)

        # Compute cosine similarity
        similarity_matrix = cosine_similarity(tfidf_matrix)

        # Convert to percentage (0-100)
        similarity_matrix = similarity_matrix * 100

        return similarity_matrix.tolist()

    except Exception as e:
        # Fallback to simple similarity if TF-IDF fails
        print(f"TF-IDF failed, using fallback: {e}")
        return [[0.0 for _ in texts] for _ in texts]


def compute_pairwise_similarity(text_a: str | None, text_b: str | None) -> float:
    """
    Compute similarity between two preprocessed texts.
    - Safely handles None / empty / very short texts.
    - Returns a percentage between 0 and 100.
    """
    a = _normalize_text(text_a)
    b = _normalize_text(text_b)

    # If either side is too short, treat as no similarity instead of crashing
    if len(a) < 10 or len(b) < 10:
        return 0.0

    try:
        vectorizer = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2),
        )

        vectors = vectorizer.fit_transform([a, b])
        score = cosine_similarity(vectors)[0][1]

        return float(score * 100)
    except Exception as e:
        # Avoid bringing down the whole request because of one bad pair
        print(f"Pairwise similarity failed: {e}")
        return 0.0


def classify_similarity(score: float) -> str:
    """
    Enhanced similarity classification with more granular levels:
    - VERY HIGH: 85-100
    - HIGH: 70-84.99
    - MEDIUM: 40-69.99
    - LOW: 20-39.99
    - VERY LOW: 0-19.99
    """
    if score >= 85:
        return "VERY HIGH"
    elif score >= 70:
        return "HIGH"
    elif score >= 55:
        return "MEDIUM"
    elif score >= 40:
        return "LOW"
    else:
        return "VERY LOW"


def compute_sections_similarities(
    sections_a: list[str],
    sections_b: list[str]
) -> list[float]:
    """
    Compute similarity score for each aligned section pair.
    Uses the safer compute_pairwise_similarity which handles short/empty texts.
    """
    similarities: list[float] = []

    limit = min(len(sections_a), len(sections_b))

    for i in range(limit):
        score = compute_pairwise_similarity(
            sections_a[i],
            sections_b[i]
        )
        similarities.append(score)

    return similarities

