import re
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
from nltk.stem import WordNetLemmatizer

# FIX BUG-2: Modern NLTK requires punkt_tab (not just punkt)
nltk.download("punkt", quiet=True)
nltk.download("punkt_tab", quiet=True)
nltk.download("stopwords", quiet=True)
nltk.download("wordnet", quiet=True)


_stopwords = set(stopwords.words("english"))
_lemmatizer = WordNetLemmatizer()


def clean_text(text: str) -> str:
    """
    Lower case, remove special characters, normalize spaces.
    """
    text = text.lower()
    text = re.sub(r"[^a-zA-Z\s]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def preprocess_text(text: str) -> str:
    """
    Full NLP pipeline:
    clean -> tokenize -> remove stopwords -> lemmatize -> join
    """
    cleaned = clean_text(text)
    tokens = word_tokenize(cleaned)
    tokens = [
        _lemmatizer.lemmatize(word)
        for word in tokens
        if word not in _stopwords and len(word) > 2
    ]
    return " ".join(tokens)