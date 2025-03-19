import os
import logging
from logging.handlers import RotatingFileHandler
from utils.config import LOG_LEVEL, LOG_FILE

def setup_logger():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    log_dir = os.path.join(base_dir, "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_file_path = os.path.join(log_dir, LOG_FILE)

    numeric_level = getattr(logging, LOG_LEVEL.upper(), None)
    if not isinstance(numeric_level, int):
        numeric_level = logging.INFO

    logger = logging.getLogger()
    logger.setLevel(numeric_level)

    # Remove any existing handlers.
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)

    # Console handler; we use sys.stdout which is now UTF-8.
    console_handler = logging.StreamHandler()
    console_handler.setLevel(numeric_level)
    console_format = logging.Formatter("%(levelname)s: %(message)s")
    console_handler.setFormatter(console_format)

    # Rotating file handler.
    file_handler = RotatingFileHandler(
        log_file_path, maxBytes=5 * 1024 * 1024, backupCount=3
    )
    file_handler.setLevel(numeric_level)
    file_format = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    file_handler.setFormatter(file_format)

    logger.addHandler(console_handler)
    logger.addHandler(file_handler)

    logger.info(f"Logger initialized with level {LOG_LEVEL}")
    return logger
