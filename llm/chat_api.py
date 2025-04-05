# llm/chat_api.py
import logging
from typing import List, Optional
from pydantic import BaseModel, Field
from utils.config import settings
from mistralai import Mistral

logger = logging.getLogger(__name__)

class ChatMessage(BaseModel):
    role: str = Field(..., description="The role of the message sender (system, user, or assistant)")
    content: str = Field(..., description="The content of the message")

class ChatResponse(BaseModel):
    answer: str = Field(..., description="The answer from the AI assistant")
    error: Optional[str] = Field(None, description="Error message if any")

async def chat_with_document(
    question: str,
    document_content: str,
    conversation_history: List[ChatMessage] = None
) -> ChatResponse:
    """
    Uses the Mistral AI API to answer questions about the document content.
    """
    if not settings.mistral_api_key:
        logger.error("Mistral AI API key not set in environment variables.")
        return ChatResponse(answer="", error="Mistral AI API key not set.")

    try:
        client = Mistral(api_key=settings.mistral_api_key)

        # Initialize with a system message.
        messages = [
            {
                "role": "system",
                "content": "You are a helpful assistant that answers questions based on the provided document. Only answer questions based on the information in the document. If the answer is not in the document, say so politely."
            }
        ]

        # Add conversation history if provided.
        if conversation_history:
            for msg in conversation_history:
                messages.append({"role": msg.role, "content": msg.content})

        # Add the context and question.
        messages.append({
            "role": "user",
            "content": (
                f"Here is the document content:\n\n{document_content}\n\n"
                f"Please answer the following question based only on the information in the document: {question}"
            )
        })

        chat_response = await client.chat.complete_async(
            model="ministral-3b-2410",
            messages=messages,
            max_tokens=2000,
            temperature=0.2
        )

        return ChatResponse(answer=chat_response.choices[0].message.content.strip())
    except Exception as e:
        logger.exception(f"Error in chat with document: {e}")
        return ChatResponse(answer="", error=f"Error generating answer: {str(e)}")
