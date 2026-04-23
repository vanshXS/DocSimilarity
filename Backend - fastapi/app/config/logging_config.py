import logging
import sys
from typing import Optional

# Standard format for logs
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

def setup_logging(level: int = logging.INFO):
    """
    Sets up basic logging configuration.
    """
    logging.basicConfig(
        level=level,
        format=LOG_FORMAT,
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )

def get_logger(name: str) -> logging.Logger:
    """
    Returns a logger instance for the given name.
    """
    return logging.getLogger(name)
