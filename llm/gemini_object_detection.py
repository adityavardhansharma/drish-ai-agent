import os
import asyncio
import aiohttp
import base64
import logging
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from utils.config import settings

logger = logging.getLogger(__name__)

API_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"gemini-1.5-flash-002:generateContent?key={settings.gemini_api_key}"
)


class Part(BaseModel):
    text: str = None
    inline_data: Dict[str, str] = None


class Content(BaseModel):
    parts: List[Part]


class GenerationConfig(BaseModel):
    temperature: float = 0.4
    max_output_tokens: int = 2048


class GeminiRequest(BaseModel):
    contents: List[Content]
    generation_config: GenerationConfig = None


class TextPart(BaseModel):
    text: str


class Candidate(BaseModel):
    content: Content


class GeminiResponse(BaseModel):
    candidates: List[Candidate]


async def detect_objects(image_path: str) -> str:
    """
    Calls the Google Gemini generative language API to analyze an image.
    Uses the correct API request format for Gemini 1.5.
    """
    try:
        # Read and encode the image file
        with open(image_path, "rb") as f:
            image_bytes = f.read()
        image_base64 = base64.b64encode(image_bytes).decode("utf-8")

        # Get image MIME type from file extension
        _, ext = os.path.splitext(image_path)
        mime_type = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.bmp': 'image/bmp'
        }.get(ext.lower(), 'image/jpeg')

        # Build the request payload with correct structure
        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": "Analyze this image and describe what objects you see. Please provide a detailed description."
                        },
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": image_base64
                            }
                        }
                    ]
                }
            ],
            "generation_config": {
                "temperature": 0.2,
                "max_output_tokens": 1024
            }
        }

        # Call the Gemini API
        async with aiohttp.ClientSession() as session:
            async with session.post(API_URL, json=payload) as response:
                resp_json = await response.json()
                if response.status != 200:
                    logger.error(f"Gemini API error: {resp_json}")
                    raise Exception(f"Gemini API error: {resp_json}")

        # Extract the response text
        try:
            response_obj = GeminiResponse(**resp_json)
            if not response_obj.candidates:
                raise Exception("No response generated")

            # Extract text from the first candidate's content parts
            result = ""
            for part in response_obj.candidates[0].content.parts:
                if hasattr(part, 'text') and part.text:
                    result += part.text

            if not result:
                raise Exception("No text content in response")

            return result

        except Exception as e:
            logger.error(f"Error parsing Gemini API response: {e}")
            # Fallback: try to extract text directly from the JSON
            if 'candidates' in resp_json and resp_json['candidates']:
                if 'content' in resp_json['candidates'][0]:
                    content = resp_json['candidates'][0]['content']
                    if 'parts' in content and content['parts']:
                        for part in content['parts']:
                            if 'text' in part:
                                return part['text']

            raise Exception(f"Failed to parse Gemini API response: {e}")

    except Exception as e:
        logger.error(f"Error in object detection: {e}")
        raise
