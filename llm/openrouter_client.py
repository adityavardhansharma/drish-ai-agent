import asyncio
import logging
from typing import Any, Dict, List, Optional

import aiohttp

from utils.config import settings

logger = logging.getLogger(__name__)

OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"


class OpenRouterConfigError(RuntimeError):
    pass


def _provider_preferences() -> Optional[Dict[str, Any]]:
    order = getattr(settings, "openrouter_provider_order", "")
    providers = [provider.strip() for provider in order.split(",") if provider.strip()]
    if not providers:
        return None
    return {"order": providers}


def _headers() -> Dict[str, str]:
    api_key = getattr(settings, "openrouter_api_key", None)
    if not api_key:
        raise OpenRouterConfigError("OPENROUTER_API_KEY is not set.")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    referer = getattr(settings, "openrouter_http_referer", None)
    title = getattr(settings, "openrouter_app_title", None)
    if referer:
        headers["HTTP-Referer"] = referer
    if title:
        headers["X-OpenRouter-Title"] = title

    return headers


def _extract_content(response_json: Dict[str, Any]) -> str:
    choices = response_json.get("choices") or []
    if not choices:
        raise RuntimeError(f"OpenRouter returned no choices: {response_json}")

    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = [
            part.get("text", "")
            for part in content
            if isinstance(part, dict) and part.get("type") == "text"
        ]
        return "\n".join(parts).strip()

    raise RuntimeError(f"OpenRouter returned no message content: {response_json}")


async def chat_completion(
    messages: List[Dict[str, Any]],
    *,
    model: Optional[str] = None,
    max_tokens: int = 2000,
    temperature: float = 0.2,
) -> str:
    if getattr(settings, "ai_provider", "openrouter").lower() != "openrouter":
        raise OpenRouterConfigError("Only AI_PROVIDER=openrouter is currently supported.")

    payload: Dict[str, Any] = {
        "model": model or getattr(settings, "openrouter_model", ""),
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    provider = _provider_preferences()
    if provider:
        payload["provider"] = provider

    async with aiohttp.ClientSession() as session:
        async with session.post(
            OPENROUTER_CHAT_URL,
            headers=_headers(),
            json=payload,
            timeout=aiohttp.ClientTimeout(total=120),
        ) as response:
            response_json = await response.json(content_type=None)
            if response.status >= 400:
                logger.error("OpenRouter API error %s: %s", response.status, response_json)
                raise RuntimeError(f"OpenRouter API error {response.status}: {response_json}")

    return _extract_content(response_json)


def chat_completion_sync(
    messages: List[Dict[str, Any]],
    *,
    model: Optional[str] = None,
    max_tokens: int = 2000,
    temperature: float = 0.2,
) -> str:
    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(
            chat_completion(
                messages,
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
            )
        )
    finally:
        loop.close()
        asyncio.set_event_loop(None)
