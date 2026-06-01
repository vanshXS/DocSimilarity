import os

from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "plagiarism_db")

# ── Connection settings ──
# serverSelectionTimeoutMS : how long to wait for MongoDB to become available (5s)
# connectTimeoutMS         : TCP connect timeout per attempt (5s)
# socketTimeoutMS          : how long a single DB operation can take (30s)
# retryWrites              : auto-retry failed writes once (safe for insert/update)
client = MongoClient(
    MONGODB_URL,
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=5000,
    socketTimeoutMS=30000,
    retryWrites=True,
)

# ── Verify connection at startup ──
try:
    client.admin.command("ping")
    print(f"[OK] MongoDB connected: {DATABASE_NAME}")
except ConnectionFailure:
    print(f"[WARNING] MongoDB not reachable yet at {MONGODB_URL} — will retry on first request")

db = client[DATABASE_NAME]

analysis_sessions_collection = db["analysis_sessions"]
analysis_files_collection = db["analysis_files"]
analysis_results_collection = db["analysis_results"]
analysis_section_results_collection = db["analysis_section_results"]

analysis_sessions_collection.create_index("session_id", unique=True)
analysis_files_collection.create_index("session_id")
analysis_files_collection.create_index("file_id", unique=True)
analysis_results_collection.create_index("session_id")
analysis_section_results_collection.create_index("session_id")
