import logging
import os
import sys


ELECTRON_APP = os.environ.get("ELECTRON_APP", "0") == "1"

if ELECTRON_APP and getattr(sys, "frozen", False):
    application_path = os.path.dirname(sys.executable)
    os.chdir(application_path)
elif ELECTRON_APP:
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

from flask import Flask

try:
    from utils.config import settings
    from utils.logger import setup_logger

    logger = setup_logger()
except ImportError as error:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    logger = logging.getLogger(__name__)
    logger.warning("Falling back to basic logging. Details: %s", error)

    class FallbackSettings:
        ai_provider = os.environ.get("AI_PROVIDER", "openrouter")
        openrouter_api_key = os.environ.get("OPENROUTER_API_KEY")
        host = os.environ.get("HOST", "127.0.0.1")
        port = int(os.environ.get("PORT", 5000))
        debug = os.environ.get("FLASK_DEBUG", "0") == "1"
        secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-secret-key")

    settings = FallbackSettings()


def create_app():
    if getattr(settings, "ai_provider", "openrouter").lower() != "openrouter":
        raise RuntimeError("Only AI_PROVIDER=openrouter is currently supported.")
    if not getattr(settings, "openrouter_api_key", None):
        logger.error("OPENROUTER_API_KEY is not set.")
        raise RuntimeError("API key missing. Set OPENROUTER_API_KEY.")

    app = Flask(__name__)
    app.secret_key = getattr(settings, "secret_key", "dev-secret-key")
    app.config["UPLOAD_FOLDER"] = "uploads"
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    from routes.api_routes import api_bp
    from routes.page_routes import page_bp

    app.register_blueprint(page_bp)
    app.register_blueprint(api_bp)
    return app


app = create_app()


if __name__ == "__main__":
    app.run(
        host=getattr(settings, "host", "127.0.0.1"),
        port=getattr(settings, "port", 5000),
        debug=getattr(settings, "debug", False),
    )
