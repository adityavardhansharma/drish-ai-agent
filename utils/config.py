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
    max_emails_to_fetch: int = int(os.environ.get("MAX_EMAILS_TO_FETCH", "10"))
    log_level: str = os.environ.get("LOG_LEVEL", "INFO")
    log_file: str = os.environ.get("LOG_FILE", "email_summarizer.log")
    app_name: str = "Email Summarizer"
    app_version: str = "1.0.0"

settings = Settings()

if not settings.gemini_api_key:
    logging.warning("GEMINI_API_KEY environment variable not set")

if not settings.mistral_api_key:
    logging.warning("MISTRAL_API_KEY environment variable not set")
