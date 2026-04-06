from typing import List


def split_into_sections(text: str, chunk_size: int = 200) -> List[str]:
    """
   Splirt text into word-based sections.
   Each section contains chunk_size words
    """

    words = text.split()
    sections = []

    for i in range(0, len(words), chunk_size):
        section_words = words[i:i + chunk_size]
        sections.append(" ".join(section_words))


    return sections