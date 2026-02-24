import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers.analysis_router import router as analysis_router

app = FastAPI(
    title="Plagiarism Detection API",
    description="Academic plagiarism detection system",
    version="1.0.0"
)


origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis_router, prefix="/api/analysis", tags=["analysis"])


@app.get("/")
def root():
    return {"message": "Plagiarism Detection API", "version": "1.0.0", "docs": "/docs"}