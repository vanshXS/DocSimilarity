import os
import shutil
from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from app.config.logging_config import get_logger
from app.db.mongodb import (
    analysis_files_collection,
    analysis_results_collection,
    analysis_section_results_collection,
    analysis_sessions_collection,
)
from app.models.analysis_model import AnalysisSession

logger = get_logger(__name__)


def _canonical_pair(file_a_id: str, file_b_id: str):
    return (file_a_id, file_b_id) if file_a_id <= file_b_id else (file_b_id, file_a_id)


def create_session(subject: str, title: Optional[str]):
    session = AnalysisSession(subject=subject, title=title)
    analysis_sessions_collection.insert_one(session.to_dict())
    logger.info(f"Created new analysis session: {session.session_id} - {title}")
    return session


def get_session_by_id(session_id: str):
    return analysis_sessions_collection.find_one({"session_id": session_id}, {"_id": 0})


def list_sessions():
    return list(analysis_sessions_collection.find({}, {"_id": 0}))


def update_session_status(session_id: str, status: str):
    analysis_sessions_collection.update_one(
        {"session_id": session_id},
        {"$set": {"status": status, "updated_at": datetime.utcnow()}},
    )
    logger.info(f"Updated session {session_id} status to {status}")


def update_session_progress(session_id: str, current_step: str, progress_percent: int):
    analysis_sessions_collection.update_one(
        {"session_id": session_id},
        {
            "$set": {
                "current_step": current_step,
                "progress_percent": progress_percent,
                "updated_at": datetime.utcnow(),
            }
        },
    )
    logger.debug(f"Session {session_id} progress: {current_step} ({progress_percent}%)")


def delete_session_data(session_id: str):
    # 1. Delete DB entries in all collections
    analysis_sessions_collection.delete_one({"session_id": session_id})
    analysis_files_collection.delete_many({"session_id": session_id})
    analysis_results_collection.delete_many({"session_id": session_id})
    analysis_section_results_collection.delete_many({"session_id": session_id})

    # 2. Delete physical files from disk
    session_dir = os.path.join("uploads", "sessions", session_id)
    if os.path.exists(session_dir):
        try:
            shutil.rmtree(session_dir)
            logger.info(f"Deleted physical directory for session {session_id}")
        except Exception as e:
            logger.error(f"Failed to delete directory {session_dir}: {str(e)}")

    logger.info(f"Completely removed data and records for session {session_id}")


def delete_multiple_sessions(session_ids: List[str]):
    # 1. Bulk delete DB entries
    analysis_sessions_collection.delete_many({"session_id": {"$in": session_ids}})
    analysis_files_collection.delete_many({"session_id": {"$in": session_ids}})
    analysis_results_collection.delete_many({"session_id": {"$in": session_ids}})
    analysis_section_results_collection.delete_many({"session_id": {"$in": session_ids}})

    # 2. Bulk delete physical files
    for session_id in session_ids:
        session_dir = os.path.join("uploads", "sessions", session_id)
        if os.path.exists(session_dir):
            try:
                shutil.rmtree(session_dir)
            except Exception as e:
                logger.error(f"Failed to delete directory {session_dir}: {str(e)}")

    logger.info(f"Bulk deleted {len(session_ids)} sessions and their associated data")


def save_file_metadata(file_docs: List[dict]):
    if file_docs:
        analysis_files_collection.insert_many(file_docs)


def get_files_by_session(session_id: str):
    return list(analysis_files_collection.find({"session_id": session_id}, {"_id": 0}))


def get_file_by_id(file_id: str):
    return analysis_files_collection.find_one({"file_id": file_id}, {"_id": 0})


def update_extracted_text(
    file_id: str,
    extracted_text: str,
    method: str,
    page_metadata: Optional[List[dict]] = None,
):
    analysis_files_collection.update_one(
        {"file_id": file_id},
        {
            "$set": {
                "extracted_text": extracted_text,
                "extraction_method": method,
                "page_metadata": page_metadata or [],
                "updated_at": datetime.utcnow(),
            }
        },
    )


def update_preprocessed_text(file_id: str, preprocessed_text: str):
    analysis_files_collection.update_one(
        {"file_id": file_id},
        {"$set": {"preprocessed_text": preprocessed_text, "updated_at": datetime.utcnow()}},
    )


def save_similarity_result(session_id: str, file_a: dict, file_b: dict, pair_result: dict):
    canonical_a_id, canonical_b_id = _canonical_pair(file_a["file_id"], file_b["file_id"])
    if canonical_a_id == canonical_b_id:
        return

    doc_a = pair_result["docA"]
    doc_b = pair_result["docB"]
    if canonical_a_id != file_a["file_id"]:
        doc_a, doc_b = doc_b, doc_a

    analysis_results_collection.update_one(
        {
            "session_id": session_id,
            "file_a_id": canonical_a_id,
            "file_b_id": canonical_b_id,
        },
        {
            "$set": {
                "session_id": session_id,
                "file_a_id": canonical_a_id,
                "file_b_id": canonical_b_id,
                "docA": doc_a,
                "docB": doc_b,
                "score": pair_result["score"],
                "page_matches": pair_result["page_matches"],
                "updated_at": datetime.utcnow(),
            },
            "$setOnInsert": {
                "result_id": str(uuid4()),
                "created_at": datetime.utcnow(),
            },
        },
        upsert=True,
    )
    logger.debug(
        f"Saved similarity result for session {session_id}: {canonical_a_id} vs {canonical_b_id} - score: {pair_result['score']}"
    )


def get_results_by_session(session_id: str):
    records = list(
        analysis_results_collection.find(
            {"session_id": session_id, "docA": {"$exists": True}, "docB": {"$exists": True}},
            {"_id": 0, "file_a_id": 1, "file_b_id": 1, "docA": 1, "docB": 1, "score": 1, "page_matches": 1},
        )
    )

    deduped_records = {}
    for record in records:
        file_a_id = record.get("file_a_id")
        file_b_id = record.get("file_b_id")
        if not file_a_id or not file_b_id:
            continue

        canonical_a_id, canonical_b_id = _canonical_pair(file_a_id, file_b_id)
        if canonical_a_id == canonical_b_id:
            continue

        key = f"{canonical_a_id}::{canonical_b_id}"
        current = deduped_records.get(key)
        if current is None or record.get("score", 0) > current.get("score", 0):
            deduped_records[key] = {
                "docA": record.get("docA"),
                "docB": record.get("docB"),
                "score": record.get("score", 0),
                "page_matches": record.get("page_matches", []),
            }

    return sorted(deduped_records.values(), key=lambda item: item.get("score", 0), reverse=True)


def save_section_similarity(
    session_id: str,
    file_a_id: str,
    file_b_id: str,
    section_index_a: int,
    section_index_b: int,
    score: float,
):
    analysis_section_results_collection.insert_one(
        {
            "result_id": str(uuid4()),
            "session_id": session_id,
            "file_a_id": file_a_id,
            "file_b_id": file_b_id,
            "section_index_a": section_index_a,
            "section_index_b": section_index_b,
            "similarity_score": round(score, 2),
            "created_at": datetime.utcnow(),
        }
    )


def get_section_results_by_session(session_id: str):
    return list(
        analysis_section_results_collection.find({"session_id": session_id}, {"_id": 0})
    )


def get_dashboard_stats():
    total_sessions = analysis_sessions_collection.count_documents({})
    total_documents = analysis_files_collection.count_documents({})
    high_risk_count = analysis_results_collection.count_documents(
        {
            "$or": [
                {"score": {"$gte": 70}},
                {"similarity_percentage": {"$gte": 70}},
            ]
        }
    )

    pipeline = [
        {
            "$project": {
                "effective_score": {
                    "$ifNull": ["$score", "$similarity_percentage"]
                }
            }
        },
        {"$match": {"effective_score": {"$ne": None}}},
        {"$group": {"_id": None, "avg_score": {"$avg": "$effective_score"}}},
    ]
    avg_result = list(analysis_results_collection.aggregate(pipeline))
    avg_score = avg_result[0]["avg_score"] if avg_result else 0

    return {
        "total_sessions": total_sessions,
        "total_documents": total_documents,
        "high_risk_cases": high_risk_count,
        "average_similarity": round(avg_score, 1),
    }
