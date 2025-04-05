import os
import logging
import sys
from utils.config import settings  # Updated import

def setup_logger():
    """
    Sets up and returns a logger with file and console handlers.
    """
    logger = logging.getLogger()
    logger.setLevel(getattr(logging, settings.log_level))  # Use settings.log_level

    logger.handlers = []

    log_dir = os.path.dirname(settings.log_file)  # Use settings.log_file
    if log_dir and not os.path.exists(log_dir):
        os.makedirs(log_dir)
    file_handler = logging.FileHandler(settings.log_file, encoding='utf-8')  # Use settings.log_file
    file_handler.setLevel(getattr(logging, settings.log_level))  # Use settings.log_level

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, settings.log_level))  # Use settings.log_level

    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    return logger
