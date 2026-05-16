# utils/config.py
import os
import logging
from pydantic_settings import BaseSettings
from pydantic_settings import SettingsConfigDict
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dotenv_path = os.path.join(BASE_DIR, ".env")
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)

class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    ai_provider: str = os.environ.get("AI_PROVIDER", "openrouter")
    openrouter_api_key: str | None = os.environ.get("OPENROUTER_API_KEY")
    openrouter_model: str = os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini")
    openrouter_email_model: str | None = os.environ.get("OPENROUTER_EMAIL_MODEL")
    openrouter_provider_order: str = os.environ.get("OPENROUTER_PROVIDER_ORDER", "")
    openrouter_http_referer: str | None = os.environ.get("OPENROUTER_HTTP_REFERER")
    openrouter_app_title: str = os.environ.get("OPENROUTER_APP_TITLE", "AI Agent Pro")
    max_emails_to_fetch: int = int(os.environ.get("MAX_EMAILS_TO_FETCH", "10"))
    log_level: str = os.environ.get("LOG_LEVEL", "INFO")
    log_file: str = os.environ.get("LOG_FILE", "email_summarizer.log")
    host: str = os.environ.get("HOST", "127.0.0.1")
    port: int = int(os.environ.get("PORT", "5000"))
    debug: bool = os.environ.get("FLASK_DEBUG", "0") == "1"
    secret_key: str = os.environ.get("FLASK_SECRET_KEY", "dev-secret-key")
    app_name: str = "AI Agent Pro"
    app_version: str = "1.0.0"
    
    # Convex configuration for email persistence
    convex_url: str | None = os.environ.get("CONVEX_URL")
    convex_app_secret: str | None = os.environ.get("CONVEX_APP_SECRET")
    convex_admin_key: str | None = os.environ.get("CONVEX_ADMIN_KEY")

settings = Settings()

if settings.ai_provider.lower() != "openrouter":
    logging.warning("Only AI_PROVIDER=openrouter is currently supported")

if not settings.openrouter_api_key:
    logging.warning("OPENROUTER_API_KEY environment variable not set")

if not settings.convex_url or not settings.convex_app_secret:
    logging.warning("Convex configuration not set (CONVEX_URL, CONVEX_APP_SECRET)")
