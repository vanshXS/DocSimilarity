from datetime import datetime
from uuid import uuid4
from typing import Optional, List, Set, Tuple

from app.db.mongodb import (
    analysis_sessions_collection,
    analysis_files_collection,
    analysis_results_collection,
    analysis_section_results_collection,
    analysis_highlights_collection
)
from app.models.analysis_model import AnalysisSession


# ---------------- SESSION LOGIC ----------------

# FIX BUG-6: Replaced str | None (Python 3.10+) with Optional[str] for 3.9 compatibility
def create_session(subject: str, title: Optional[str]):
    session = AnalysisSession(subject=subject, title=title)
    analysis_sessions_collection.insert_one(session.to_dict())
    return session


def get_session_by_id(session_id: str):
    return analysis_sessions_collection.find_one(
        {"session_id": session_id},
        {"_id": 0}
    )


def list_sessions():
    return list(
        analysis_sessions_collection.find({}, {"_id": 0})
    )


def update_session_status(session_id: str, status: str):
    """
    Updates the status of a session (e.g., PROCESSING, COMPLETED, FAILED).
    """
    analysis_sessions_collection.update_one(
        {"session_id": session_id},
        {
            "$set": {
                "status": status,
                "updated_at": datetime.utcnow()
            }
        }
    )


# ---------------- FILE METADATA LOGIC ----------------

# FIX BUG-6: Replaced list[dict] with List[dict] for Python 3.9 compatibility
def save_file_metadata(file_docs: List[dict]):
    if file_docs:
        analysis_files_collection.insert_many(file_docs)


def get_files_by_session(session_id: str):
    return list(
        analysis_files_collection.find(
            {"session_id": session_id},
            {"_id": 0}
        )
    )


def update_extracted_text(
    file_id: str,
    extracted_text: str,
    method: str
):
    analysis_files_collection.update_one(
        {"file_id": file_id},
        {
            "$set": {
                "extracted_text": extracted_text,
                "extraction_method": method,
                "updated_at": datetime.utcnow()
            }
        }
    )


def update_preprocessed_text(
    file_id: str,
    preprocessed_text: str
):
    analysis_files_collection.update_one(
        {"file_id": file_id},
        {
            "$set": {
                "preprocessed_text": preprocessed_text,
                "updated_at": datetime.utcnow()
            }
        }
    )


# ---------------- SIMILARITY LOGIC ----------------

# FIX BUG-6: Replaced set[tuple[str, str]] with Set[Tuple[str, str]]
def get_existing_similarity_pairs(session_id: str) -> Set[Tuple[str, str]]:
    """
    Returns already-computed file pairs so we don't re-run them.
    Pairs are always stored in (smaller_id, larger_id) order.
    """
    results = analysis_results_collection.find(
        {"session_id": session_id},
        {"file_a.file_id": 1, "file_b.file_id": 1}
    )

    pairs = set()
    for r in results:
        a_id = r["file_a"]["file_id"]
        b_id = r["file_b"]["file_id"]

        # Always store in (smaller, larger) order
        if a_id > b_id:
            a_id, b_id = b_id, a_id

        pairs.add((a_id, b_id))

    return pairs


def save_similarity_result(
    session_id: str,
    file_a: dict,
    file_b: dict,
    score: float,
    level: str
):
    analysis_results_collection.insert_one({
        "result_id": str(uuid4()),
        "session_id": session_id,
        "file_a": {
            "file_id": file_a["file_id"],
            "filename": file_a["filename"]
        },
        "file_b": {
            "file_id": file_b["file_id"],
            "filename": file_b["filename"]
        },
        "similarity_percentage": round(score, 2),
        "level": level,
        "created_at": datetime.utcnow()
    })


def get_results_by_session(session_id: str):
    return list(
        analysis_results_collection.find(
            {"session_id": session_id},
            {"_id": 0}
        )
    )


def save_section_similarity(
    session_id: str,
    file_a_id: str,
    file_b_id: str,
    section_index: int,
    score: float,
    level: str
):
    analysis_section_results_collection.insert_one({
        "result_id": str(uuid4()),
        "session_id": session_id,
        "file_a_id": file_a_id,
        "file_b_id": file_b_id,
        "section_index": section_index,
        "similarity_percentage": round(score, 2),
        "level": level,
        "created_at": datetime.utcnow()
    })


def get_section_results_by_session(session_id: str):
    return list(
        analysis_section_results_collection.find(
            {"session_id": session_id},
            {"_id": 0}
        )
    )


def save_highlight(
    session_id: str,
    file_a_id: str,
    file_b_id: str,
    sentence_a: str,
    sentence_b: str,
    similarity: float
):
    analysis_highlights_collection.update_one(
        {
            "session_id": session_id,
            "file_a_id": file_a_id,
            "file_b_id": file_b_id,
            "sentence_a": sentence_a,
            "sentence_b": sentence_b,
        },
        {
            "$setOnInsert": {
                "highlight_id": str(uuid4()),
                "session_id": session_id,
                "file_a_id": file_a_id,
                "file_b_id": file_b_id,
                "sentence_a": sentence_a,
                "sentence_b": sentence_b,
                "similarity": round(similarity, 2),
                "created_at": datetime.utcnow()
            }
        },
        upsert=True
    )


def get_highlights_by_session(session_id: str):
    return list(
        analysis_highlights_collection.find(
            {"session_id": session_id},
            {"_id": 0}
        )
    )


def get_highlights_for_pair(
    session_id: str,
    file_a_id: str,
    file_b_id: str
):
    """
    Fetch highlights for a specific file pair - checks both orderings (a,b) and (b,a).
    """
    return list(
        analysis_highlights_collection.find(
            {
                "session_id": session_id,
                "$or": [
                    {"file_a_id": file_a_id, "file_b_id": file_b_id},
                    {"file_a_id": file_b_id, "file_b_id": file_a_id},
                ],
            },
            {"_id": 0}
        )
    )


# ---------------- DASHBOARD ----------------

def get_dashboard_stats():
    total_sessions = analysis_sessions_collection.count_documents({})
    total_documents = analysis_files_collection.count_documents({})
    high_risk_count = analysis_results_collection.count_documents({
        "similarity_percentage": {"$gte": 70}
    })

    pipeline = [
        {"$group": {"_id": None, "avg_score": {"$avg": "$similarity_percentage"}}}
    ]
    avg_result = list(analysis_results_collection.aggregate(pipeline))
    avg_score = avg_result[0]["avg_score"] if avg_result else 0

    return {
        "total_sessions": total_sessions,
        "total_documents": total_documents,
        "high_risk_cases": high_risk_count,
        "average_similarity": round(avg_score, 1)
    }