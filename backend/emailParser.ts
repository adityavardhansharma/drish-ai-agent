import { Buffer } from "node:buffer";
import type { GmailMessage, GmailMessagePart, ParsedEmail } from "./types";
import { logger } from "./logger";

function decodeMimeWords(value: string) {
  return value.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_match, charset, encoding, text) => {
    try {
      const bytes =
        String(encoding).toUpperCase() === "B"
          ? Buffer.from(text, "base64")
          : Buffer.from(String(text).replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(Number.parseInt(hex, 16))), "binary");
      return bytes.toString(String(charset).toLowerCase() as BufferEncoding);
    } catch {
      return text;
    }
  });
}

function base64UrlDecode(data: string) {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8").trim();
}

function headerValue(message: GmailMessage, name: string, fallback: string) {
  const headers = message.payload?.headers ?? [];
  const header = headers.find((candidate) => candidate.name?.toLowerCase() === name);
  return decodeMimeWords(header?.value ?? fallback);
}

function isAttachment(part: GmailMessagePart) {
  const disposition = part.headers?.find(
    (header) => header.name?.toLowerCase() === "content-disposition",
  )?.value;
  return disposition?.toLowerCase().includes("attachment") ?? Boolean(part.filename);
}

function findBody(part: GmailMessagePart | null | undefined, mimeType: string): string | null {
  if (!part || isAttachment(part)) {
    return null;
  }

  if (part.mimeType === mimeType && part.body?.data) {
    try {
      return base64UrlDecode(part.body.data);
    } catch (error) {
      logger.error(`Error decoding ${mimeType} body`, error instanceof Error ? error.message : error);
    }
  }

  for (const child of part.parts ?? []) {
    const body = findBody(child, mimeType);
    if (body) {
      return body;
    }
  }
  return null;
}

export function parseSender(sender: string) {
  const match = sender.match(/<([^>]+)>/);
  return {
    fromName: sender.replace(/<[^>]+>/g, "").replace(/^"|"$/g, "").trim() || sender || "Unknown",
    fromEmail: match?.[1] ?? "",
  };
}

export function parseEmailContent(emailData: GmailMessage): ParsedEmail | null {
  try {
    const sender = headerValue(emailData, "from", "Unknown Sender");
    const subject = headerValue(emailData, "subject", "No Subject");
    const body =
      findBody(emailData.payload, "text/plain") ??
      findBody(emailData.payload, "text/html") ??
      (emailData.payload?.body?.data ? base64UrlDecode(emailData.payload.body.data) : "") ??
      "";

    return {
      sender,
      subject,
      body: body.trim(),
      messageId: emailData.id ?? "",
    };
  } catch (error) {
    logger.error("Error parsing email", error instanceof Error ? error.message : error);
    return null;
  }
}
