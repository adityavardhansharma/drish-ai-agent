import { settings } from "./config";
import { logger } from "./logger";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function providerPreferences() {
  const providers = settings.openrouterProviderOrder
    .split(",")
    .map((provider) => provider.trim())
    .filter(Boolean);
  return providers.length > 0 ? { order: providers } : undefined;
}

function headers() {
  if (!settings.openrouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is not set.");
  }

  const result: Record<string, string> = {
    Authorization: `Bearer ${settings.openrouterApiKey}`,
    "Content-Type": "application/json",
  };
  if (settings.openrouterHttpReferer) {
    result["HTTP-Referer"] = settings.openrouterHttpReferer;
  }
  if (settings.openrouterAppTitle) {
    result["X-OpenRouter-Title"] = settings.openrouterAppTitle;
  }
  return result;
}

function extractContent(responseJson: unknown): string {
  const choices = (responseJson as { choices?: Array<{ message?: { content?: unknown } }> })
    .choices;
  if (!choices?.length) {
    throw new Error(`OpenRouter returned no choices: ${JSON.stringify(responseJson)}`);
  }

  const content = choices[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "object" &&
        part !== null &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : "",
      )
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  throw new Error(`OpenRouter returned no message content: ${JSON.stringify(responseJson)}`);
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: { model?: string; maxTokens?: number; temperature?: number } = {},
) {
  if (settings.aiProvider.toLowerCase() !== "openrouter") {
    throw new Error("Only AI_PROVIDER=openrouter is currently supported.");
  }

  const payload: Record<string, unknown> = {
    model: options.model ?? settings.openrouterModel,
    messages,
    max_tokens: options.maxTokens ?? 2000,
    temperature: options.temperature ?? 0.2,
  };
  const provider = providerPreferences();
  if (provider) {
    payload.provider = provider;
  }

  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });
  const responseJson = await response.json().catch(() => ({}));

  if (!response.ok) {
    logger.error(`OpenRouter API error ${response.status}`, responseJson);
    throw new Error(`OpenRouter API error ${response.status}: ${JSON.stringify(responseJson)}`);
  }

  return extractContent(responseJson);
}
