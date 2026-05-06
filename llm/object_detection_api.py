import os
import base64
import logging
from utils.config import settings
from llm.openrouter_client import chat_completion

logger = logging.getLogger(__name__)


async def detect_objects(image_path: str) -> str:
    """
    Calls OpenRouter with a vision-capable model to analyze an image.
    """
    try:
        with open(image_path, "rb") as f:
            image_bytes = f.read()
        image_base64 = base64.b64encode(image_bytes).decode("utf-8")

        _, ext = os.path.splitext(image_path)
        mime_type = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.bmp': 'image/bmp'
        }.get(ext.lower(), 'image/jpeg')

        return await chat_completion(
            [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Analyze this image and describe what objects you see. Provide a detailed description.",
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{image_base64}"
                            },
                        },
                    ],
                }
            ],
            model=getattr(settings, "openrouter_vision_model", None),
            max_tokens=1024,
            temperature=0.2,
        )
    except Exception as e:
        logger.error(f"Error in object detection: {e}")
        raise
