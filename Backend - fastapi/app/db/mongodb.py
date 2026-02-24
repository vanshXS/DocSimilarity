import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

# MongoDB Configuration
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "plagiarism_db")

# Create MongoDB client
client = MongoClient(MONGODB_URL)
db = client[DATABASE_NAME]

# Collections
analysis_sessions_collection = db["analysis_sessions"]
analysis_files_collection = db["analysis_files"]
analysis_results_collection = db["analysis_results"]
analysis_section_results_collection = db["analysis_section_results"]
analysis_highlights_collection = db["analysis_highlights"]

# Create indexes for better performance
analysis_sessions_collection.create_index("session_id", unique=True)
analysis_files_collection.create_index("session_id")
analysis_files_collection.create_index("file_id", unique=True)
analysis_results_collection.create_index("session_id")
analysis_section_results_collection.create_index("session_id")
analysis_highlights_collection.create_index("session_id")

print(f"✅ MongoDB connected: {DATABASE_NAME}")