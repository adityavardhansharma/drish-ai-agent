# utils/config.py
import os
import logging
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dotenv_path = os.path.join(BASE_DIR, ".env")
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)

class Settings(BaseSettings):
    gemini_api_key: str | None = os.environ.get("GEMINI_API_KEY")
    mistral_api_key: str | None = os.environ.get("MISTRAL_API_KEY")
    mistral_reply_api_key: str | None = os.environ.get("MISTRAL_REPLY_API_KEY")
    max_emails_to_fetch: int = int(os.environ.get("MAX_EMAILS_TO_FETCH", "10"))
    log_level: str = os.environ.get("LOG_LEVEL", "INFO")
    log_file: str = os.environ.get("LOG_FILE", "email_summarizer.log")
    app_name: str = "Email Summarizer"
    app_version: str = "1.0.0"
    
    # Supabase configuration
    supabase_url: str | None = os.environ.get("SUPABASE_URL")
    supabase_key: str | None = os.environ.get("SUPABASE_KEY")
    
    # Leave checker configuration
    leave_sheet_id: str | None = os.environ.get("LEAVE_SHEET_ID")

settings = Settings()

if not settings.gemini_api_key:
    logging.warning("GEMINI_API_KEY environment variable not set")

if not settings.mistral_api_key:
    logging.warning("MISTRAL_API_KEY environment variable not set")

if not settings.mistral_reply_api_key:
    logging.warning("MISTRAL_REPLY_API_KEY environment variable not set")

if not settings.supabase_url or not settings.supabase_key:
    logging.warning("Supabase configuration not set (SUPABASE_URL, SUPABASE_KEY)")

if not settings.leave_sheet_id:
    logging.warning("LEAVE_SHEET_ID environment variable not set")
