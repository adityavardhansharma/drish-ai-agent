# llm/mistral_api.py
import logging
from utils.config import settings
from mistralai import Mistral

logger = logging.getLogger(__name__)

async def generate_summary(document_content, max_tokens=20000):
    """
    Uses the Mistral AI API to generate a detailed, comprehensive summary of the provided document content.
    """
    if not settings.mistral_api_key:
        logger.error("Mistral AI API key not set in environment variables.")
        return "Error: Mistral AI API key not set."

    try:
        client = Mistral(api_key=settings.mistral_api_key)
        prompt = """
        Create a comprehensive, detailed summary of the following document. 
        Your summary should:
        - Capture all key points, arguments, and conclusions
        - Preserve important details, statistics, and evidence
        - Maintain the logical flow and structure of the original document
        - Include all relevant names, dates, and specific information
        - Be thorough while remaining concise but no detail about a point mentioned in summary should be missed
        - Not omit any significant information from the original text

        Document content:
        {content}
        """.format(content=document_content)

        messages = [
            {
                "role": "system",
                "content": "You are a precise summarization assistant that creates detailed, comprehensive summaries without omitting important information."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
        chat_response = await client.chat.complete_async(
            model="ministral-3b-2410",
            messages=messages,
            max_tokens=max_tokens,
            temperature=0.2
        )
        return chat_response.choices[0].message.content.strip()
    except Exception as e:
        logger.exception(f"Error generating summary: {e}")
        return f"Error generating summary: {str(e)}"
