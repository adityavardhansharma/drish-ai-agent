import logging
from utils.config import settings
from llm.openrouter_client import chat_completion

logger = logging.getLogger(__name__)

async def generate_email_reply(email_content, max_tokens=2000):
    """
    Uses OpenRouter to generate a professional email reply based on the provided email content.
    """
    try:
        prompt = f"""
Based On the Content of the Email :
{email_content}
Generate a professional and concise email reply for the following email it should not repeat the content of the email and should be a reply to the email such that it gives answer to all the questions aked on the email or properly analzye the content and give a proffesional reply that actually helps the sender of the email.
"""
        messages = [
            {
                "role": "system",
                "content": "You are an email assistant that drafts professional replies."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
        return await chat_completion(
            messages,
            model=getattr(settings, "openrouter_email_model", None),
            max_tokens=max_tokens,
            temperature=0.6,
        )
    except Exception as e:
        logger.exception(f"Error generating email reply: {e}")
        return f"Error generating email reply: {str(e)}"
