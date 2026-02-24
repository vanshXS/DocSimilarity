from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class CreateSessionRequest(BaseModel):
    subject: str
    title: Optional[str] = None


class CreateSessionResponse(BaseModel):
    session_id: str
    subject: str
    title: Optional[str]
    status: str
    created_at: datetime


class SessionStatusResponse(BaseModel):
    session_id: str
    status: str
    subject: str
    title: Optional[str]
    created_at: datetime


class UploadResponse(BaseModel):
    message: str
    session_id: str
    files_uploaded: int