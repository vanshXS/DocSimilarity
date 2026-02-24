import re
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
from nltk.stem import WordNetLemmatizer


nltk.download("punkt")
nltk.download("stopwords")
nltk.download("wordnet")


_stopwords = set(stopwords.words("english"))
_lemmatizer = WordNetLemmatizer()


def clean_text(text:str) -> str:

    """
    Lower case, remove special char, normalize spaces.
    """

    text = text.lower()
    text = re.sub(r"[^a-zA-Z\s]", " ", text)
    text= re.sub(r"\s+", " ", text)
    
    return text.strip()

def preprocess_text(text:str) -> str:

    """
    Full NLP pipelines:
    clean -> tokenize -> remove stopword -> lemmatize -> join
    """
    cleaned = clean_text(text)

    tokens = word_tokenize(cleaned)

    tokens = [
        _lemmatizer.lemmatize(word)
        for word in tokens
        if word not in _stopwords and len(word) > 2
    ]

    return " ".join(tokens)