import logging
from utils.config import settings
from llm.openrouter_client import chat_completion

logger = logging.getLogger(__name__)


async def generate_summary(document_content, max_tokens=50000):
    """
    Uses OpenRouter to generate a detailed, comprehensive summary of the document content.
    """
    try:
        prompt = f"""
        Create a comprehensive, detailed summary of the following document. 
        Your summary should:
        - Capture all key points, arguments, and conclusions
        - Preserve important details, statistics, and evidence
        - Maintain the logical flow and structure of the original document
        - Include all relevant names, dates, and specific information
        - Be thorough while remaining concise but no detail about a point mentioned in summary should be missed
        - Not omit any significant information from the original text

        Document content:
        {document_content}
        """

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
        return await chat_completion(
            messages,
            model=getattr(settings, "openrouter_document_model", None),
            max_tokens=max_tokens,
            temperature=0.2,
        )
    except Exception as e:
        logger.exception(f"Error generating summary: {e}")
        return f"Error generating summary: {str(e)}"
