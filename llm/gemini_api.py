import logging
import google.generativeai as genai
from utils.config import settings

logger = logging.getLogger(__name__)

try:
    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel("gemini-1.5-flash")
except Exception as e:
    logger.error(f"Error configuring Gemini API: {e}")
    model = None


def generate_summary(email_content, max_output_tokens=500):
    """
    Uses the Gemini API to generate a summary of the provided email content.
    """
    if not model:
        logger.error("Gemini model not initialized")
        return "Error: Could not initialize Gemini model"

    max_content_length = 50000  # Adjust based on model limits.
    if len(email_content) > max_content_length:
        logger.warning(f"Email content too long ({len(email_content)} chars), truncating")
        email_content = email_content[:max_content_length] + "... [content truncated]"

    prompt = f"""
Summarize the following email content in a concise and informative way.
Focus on the main points, key information, and any action items or requests.
Keep the summary short (5-10 sentences) and factual.

Email Content:
{email_content}
"""
    try:
        request_id = hex(id(email_content))[2:10]
        logger.info(f"Sending Gemini API request {request_id}")
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                max_output_tokens=max_output_tokens,
                temperature=0.2,
            )
        )
        logger.info(f"Received response for request {request_id}")
        return response.text.strip() if response and response.text else ""
    except Exception as e:
        logger.exception(f"Error generating summary: {e}")
        return f"Error generating summary: {str(e)}"
