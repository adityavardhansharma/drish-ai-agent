import { parseEmailContent, parseSender } from "./emailParser";
import { fetchEmails, getGmailService, sendReply } from "./gmail";
import { generateEmailReply, generateSummary } from "./llm";
import { logger } from "./logger";
import {
  listEmailSummaries,
  markEmailReplyFailed,
  markEmailReplySent,
  saveEmailSummary,
  updateEmailDraft,
} from "./convexStore";
import type { StreamEvent } from "./types";

export async function* processFetchEmails(): AsyncGenerator<StreamEvent> {
  yield { type: "status", message: "Authenticating with Gmail..." };
  const service = await getGmailService();
  if (!service) {
    yield { type: "error", message: "Failed to authenticate with Gmail." };
    return;
  }

  yield { type: "status", message: "Fetching unread emails..." };
  const emails = await fetchEmails(service);
  if (!emails.length) {
    yield { type: "status", message: "No new emails found." };
    yield { type: "completed", success: true, message: "No new emails." };
    return;
  }

  const total = emails.length;
  yield { type: "status", message: `Processing ${total} emails...` };
  yield { type: "progress", current: 0, total };

  let processed = 0;
  for (const [index, emailData] of emails.entries()) {
    try {
      yield { type: "status", message: `Parsing email ${index + 1}/${total}...` };
      const parsed = parseEmailContent(emailData);
      if (!parsed) {
        logger.error(`Email ${index + 1}/${total} parse error`);
        continue;
      }

      const content = `Subject: ${parsed.subject}\nFrom: ${parsed.sender}\nBody: ${parsed.body}`;
      yield { type: "status", message: `Summarizing email ${index + 1}/${total}...` };
      const [summary, reply] = await Promise.all([
        generateSummary(content),
        generateEmailReply(content),
      ]);

      const sender = parseSender(parsed.sender);
      const payload = {
        summary:
          `From: ${parsed.sender}\n` +
          `Subject: ${parsed.subject}\n` +
          `Message ID: ${parsed.messageId || "N/A"}\n\n` +
          `Summary:\n${summary}`,
        reply,
        message_id: parsed.messageId,
        to_email: parsed.sender,
        sender: parsed.sender,
        from_email: sender.fromEmail,
        subject: parsed.subject,
      };

      const savedRecord = await saveEmailSummary(payload);
      yield {
        type: "email_summary",
        data: savedRecord ? { ...payload, saved_record: savedRecord } : payload,
      };
      processed += 1;
      yield { type: "progress", current: processed, total };
      logger.info(`Processed email ${index + 1}/${total}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Processing error on email ${index + 1}`, message);
      yield { type: "error", message: `Error processing email ${index + 1}: ${message}` };
      yield { type: "progress", current: processed, total };
    }
  }

  yield { type: "status", message: `Completed processing ${processed}/${total} emails.` };
  yield { type: "completed", success: true, message: "Email fetch complete." };
}

export async function processSendEmail(
  messageId: string,
  toEmail: string,
  subject: string,
  body: string,
): Promise<[boolean, string]> {
  const service = await getGmailService();
  if (!service) {
    return [false, "Failed to authenticate with Gmail."];
  }

  const replySubject = subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
  const [success, response] = await sendReply(service, messageId, toEmail, replySubject, body);
  if (success) {
    await markEmailReplySent(messageId, body, response);
    return [true, "Email sent successfully!"];
  }

  await markEmailReplyFailed(messageId, response);
  return [false, `Failed to send email: ${response}`];
}

export const processListEmailSummaries = listEmailSummaries;
export const processUpdateEmailDraft = updateEmailDraft;
