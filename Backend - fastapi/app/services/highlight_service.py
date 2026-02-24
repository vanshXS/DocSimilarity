import nltk
from nltk.tokenize import sent_tokenize
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

nltk.download("punkt")


def split_into_sentences(text: str) -> list[str]:
    """
    Split text into meaningful sentences.
    Very short fragments are discarded to avoid noisy matches.
    """
    sentences = sent_tokenize(text or "")
    return [s.strip() for s in sentences if len(s.strip()) > 10]


def sentence_similarity(sentence_a: str, sentence_b: str) -> float:
    """
    Compute similarity between two sentences using TF-IDF + cosine.
    Safely handles empty / very short sentences.
    """
    a = (sentence_a or "").strip()
    b = (sentence_b or "").strip()

    # If either side is too short, treat as no meaningful similarity
    if len(a) < 5 or len(b) < 5:
        return 0.0

    try:
        vectorizer = TfidfVectorizer(stop_words="english")
        vectors = vectorizer.fit_transform([a, b])
        score = cosine_similarity(vectors)[0][1]
        return float(score * 100)
    except Exception as e:
        print(f"Sentence similarity failed: {e}")
        return 0.0