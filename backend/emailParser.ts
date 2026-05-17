import { Buffer } from "node:buffer";
import type { gmail_v1 } from "googleapis";
import { PDFParse } from "pdf-parse";
import type { GmailMessage, GmailMessagePart, ParsedEmail, ParsedEmailAttachment } from "./types";
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

function base64UrlDecodeBuffer(data: string) {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64");
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

function collectAttachmentParts(part: GmailMessagePart | null | undefined, result: GmailMessagePart[] = []) {
  if (!part) return result;
  if (isAttachment(part) && part.body?.attachmentId) {
    result.push(part);
  }
  for (const child of part.parts ?? []) {
    collectAttachmentParts(child, result);
  }
  return result;
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

async function extractPdfText(data: Buffer, filename: string) {
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText({ first: 8 });
    return result.text.trim();
  } catch (error) {
    logger.error(`Error extracting PDF text from ${filename}`, error instanceof Error ? error.message : error);
    return "";
  } finally {
    await parser.destroy();
  }
}

async function extractAttachmentText(
  service: gmail_v1.Gmail,
  messageId: string,
  part: GmailMessagePart,
): Promise<ParsedEmailAttachment | null> {
  const attachmentId = part.body?.attachmentId;
  const filename = decodeMimeWords(part.filename || "attachment");
  const mimeType = part.mimeType || "application/octet-stream";
  if (!attachmentId) return null;

  try {
    const response = await service.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });
    const data = response.data.data ? base64UrlDecodeBuffer(response.data.data) : Buffer.alloc(0);
    if (data.length === 0) return null;

    let text = "";
    if (mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
      text = await extractPdfText(data, filename);
    } else if (
      mimeType.startsWith("text/") ||
      /\.(txt|md|csv|json|log)$/i.test(filename)
    ) {
      text = data.toString("utf8").trim();
    }

    if (!text) {
      return null;
    }

    return {
      filename,
      mimeType,
      text: text.length > 24_000 ? `${text.slice(0, 24_000)}\n[attachment text truncated]` : text,
    };
  } catch (error) {
    logger.error(`Error loading attachment ${filename}`, error instanceof Error ? error.message : error);
    return null;
  }
}

export async function extractEmailAttachments(
  service: gmail_v1.Gmail,
  emailData: GmailMessage,
): Promise<ParsedEmailAttachment[]> {
  const messageId = emailData.id ?? "";
  if (!messageId) return [];
  const parts = collectAttachmentParts(emailData.payload).slice(0, 4);
  const attachments: ParsedEmailAttachment[] = [];

  for (const part of parts) {
    const attachment = await extractAttachmentText(service, messageId, part);
    if (attachment) {
      attachments.push(attachment);
    }
  }

  return attachments;
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
      attachments: [],
    };
  } catch (error) {
    logger.error("Error parsing email", error instanceof Error ? error.message : error);
    return null;
  }
}
