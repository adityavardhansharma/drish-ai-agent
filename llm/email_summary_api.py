from utils.config import settings
from llm.openrouter_client import chat_completion_sync


def generate_summary(email_content, max_output_tokens=500):
    """
    Generates a summary of the provided email content through OpenRouter.
    """
    max_content_length = 50000  # Adjust based on model limits.
    if len(email_content) > max_content_length:
        email_content = email_content[:max_content_length] + "... [content truncated]"

    try:
        return chat_completion_sync(
            [
                {
                    "role": "system",
                    "content": "Summarize emails concisely and factually, including action items.",
                },
                {
                    "role": "user",
                    "content": (
                        "Summarize the following email content in 5-10 sentences. "
                        "Focus on main points, key information, and requests.\n\n"
                        f"Email Content:\n{email_content}"
                    ),
                },
            ],
            model=getattr(settings, "openrouter_email_model", None),
            max_tokens=max_output_tokens,
            temperature=0.2,
        )
    except Exception as error:
        return f"Error generating summary: {str(error)}"
