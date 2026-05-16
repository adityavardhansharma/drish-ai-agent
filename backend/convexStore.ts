import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { settings } from "./config";
import { parseSender } from "./emailParser";
import { logger } from "./logger";
import type { SavedEmailRecord } from "./types";

function convexClient() {
  if (!settings.convexUrl || !settings.convexAppSecret) {
    return null;
  }
  const client = new ConvexHttpClient(settings.convexUrl);
  if (settings.convexAdminKey) {
    (client as unknown as { setAdminAuth?: (key: string) => void }).setAdminAuth?.(
      settings.convexAdminKey,
    );
  }
  return client;
}

function convexArgs<T extends Record<string, unknown>>(args: T) {
  return { appSecret: settings.convexAppSecret ?? "", ...args };
}

export async function saveEmailSummary(payload: {
  message_id: string;
  to_email: string;
  sender: string;
  subject: string;
  summary: string;
  reply: string;
}) {
  if (!payload.message_id) {
    logger.warn("Skipping email summary persistence: missing message_id");
    return null;
  }

  const client = convexClient();
  if (!client) {
    logger.warn("Skipping email summary persistence: Convex unavailable");
    return null;
  }

  try {
    const sender = parseSender(payload.sender || payload.to_email);
    return await client.mutation(
      api.emails.upsertSummary,
      convexArgs({
        messageId: payload.message_id,
        toEmail: payload.to_email ?? "",
        fromEmail: sender.fromEmail,
        fromName: sender.fromName,
        subject: payload.subject ?? "",
        summary: payload.summary ?? "",
        draftReply: payload.reply ?? "",
        status: "generated",
      }),
    );
  } catch (error) {
    logger.error("Error saving email summary to Convex", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function listEmailSummaries(limit = 100) {
  const client = convexClient();
  if (!client) {
    return { success: false, error: "Convex connection not available", data: [] };
  }

  try {
    const records = await client.query(api.emails.listRecent, convexArgs({ limit }));
    return { success: true, data: (records ?? []) as SavedEmailRecord[] };
  } catch (error) {
    logger.error("Error loading email summaries from Convex", error instanceof Error ? error.message : error);
    return { success: false, error: error instanceof Error ? error.message : String(error), data: [] };
  }
}

export async function markEmailReplySent(
  messageId: string,
  sentReplyBody: string,
  gmailResponse: string,
) {
  if (!messageId) {
    logger.warn("Skipping sent email persistence: missing message_id");
    return null;
  }

  const client = convexClient();
  if (!client) {
    logger.warn("Skipping sent email persistence: Convex unavailable");
    return null;
  }

  try {
    return await client.mutation(
      api.emails.markReplySent,
      convexArgs({
        messageId,
        sentReplyBody: sentReplyBody ?? "",
        gmailResponse: String(gmailResponse ?? ""),
      }),
    );
  } catch (error) {
    logger.error("Error marking email reply sent in Convex", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function updateEmailDraft(messageId: string, draftReply: string) {
  if (!messageId) {
    return { success: false, error: "message_id is required" };
  }

  const client = convexClient();
  if (!client) {
    return { success: false, error: "Convex connection not available" };
  }

  try {
    const record = await client.mutation(
      api.emails.updateDraftReply,
      convexArgs({
        messageId,
        draftReply: draftReply ?? "",
      }),
    );
    return { success: true, data: record };
  } catch (error) {
    logger.error("Error updating email draft in Convex", error instanceof Error ? error.message : error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function markEmailReplyFailed(messageId: string, errorMessage: string) {
  if (!messageId) {
    logger.warn("Skipping failed email persistence: missing message_id");
    return null;
  }

  const client = convexClient();
  if (!client) {
    return null;
  }

  try {
    return await client.mutation(
      api.emails.markReplyFailed,
      convexArgs({
        messageId,
        errorMessage: errorMessage ?? "",
      }),
    );
  } catch (error) {
    logger.error("Error marking email reply failed in Convex", error instanceof Error ? error.message : error);
    return null;
  }
}
