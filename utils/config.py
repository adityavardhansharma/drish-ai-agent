import os
import logging
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dotenv_path = os.path.join(BASE_DIR, ".env")
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
MAX_EMAILS_TO_FETCH = int(os.environ.get("MAX_EMAILS_TO_FETCH", "10"))
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
LOG_FILE = os.environ.get("LOG_FILE", "email_summarizer.log")
APP_NAME = "Email Summarizer"
APP_VERSION = "1.0.0"

if not GEMINI_API_KEY:
    logging.warning("GEMINI_API_KEY environment variable not set")
