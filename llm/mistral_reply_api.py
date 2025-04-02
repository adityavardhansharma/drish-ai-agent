import logging
from utils.config import settings
from mistralai import Mistral

logger = logging.getLogger(__name__)

async def generate_email_reply(email_content, max_tokens=2000):
    """
    Uses the Mistral AI API to generate a professional email reply based on the provided email content.
    """
    if not settings.mistral_reply_api_key:
        logger.error("Mistral Reply API key not set in environment variables.")
        return "Error: Mistral Reply API key not set."
    try:
        client = Mistral(api_key=settings.mistral_reply_api_key)
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
        chat_response = await client.chat.complete_async(
            model="ministral-8b-latest",
            messages=messages,
            max_tokens=max_tokens,
            temperature=0.6
        )
        return chat_response.choices[0].message.content.strip() if chat_response and chat_response.choices else ""
    except Exception as e:
        logger.exception(f"Error generating email reply: {e}")
        return f"Error generating email reply: {str(e)}"
