from datetime import datetime
from uuid import uuid4
from typing import Optional


class AnalysisSession:
    """
    Model for an analysis session
    """
    def __init__(
        self,
        subject: str,
        title: Optional[str] = None,
        session_id: Optional[str] = None,
        status: str = "CREATED",
        current_step: Optional[str] = None,
        progress_percent: int = 0,
        created_at: Optional[datetime] = None,
        updated_at: Optional[datetime] = None
    ):
        self.session_id = session_id or str(uuid4())
        self.subject = subject
        self.title = title
        self.status = status
        self.current_step = current_step
        self.progress_percent = progress_percent
        self.created_at = created_at or datetime.utcnow()
        self.updated_at = updated_at or datetime.utcnow()

    def to_dict(self):
        return {
            "session_id": self.session_id,
            "subject": self.subject,
            "title": self.title,
            "status": self.status,
            "current_step": self.current_step,
            "progress_percent": self.progress_percent,
            "created_at": self.created_at,
            "updated_at": self.updated_at
        }