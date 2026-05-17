import { settings } from "./config";
import { logger } from "./logger";
import { chatCompletion } from "./openrouterClient";

export async function generateSummary(emailContent: string, maxOutputTokens = 500) {
  const maxContentLength = 50_000;
  const content =
    emailContent.length > maxContentLength
      ? `${emailContent.slice(0, maxContentLength)}... [content truncated]`
      : emailContent;

  try {
    return await chatCompletion(
      [
        {
          role: "system",
          content: [
            "You are an email summarization assistant.",
            "Return only the final summary. Do not include analysis, reasoning, alternatives, model notes, JSON, tool output, or multiple versions.",
            "Use exactly these two markdown sections:",
            "## Email Summary",
            "A concise paragraph describing what the email is about, including any relevant attachment or document content.",
            "## Key Points",
            "3-6 bullet points with concrete facts, dates, requests, deadlines, and next actions.",
            "If attachments are included, incorporate their content naturally and mention the attachment filename only when useful.",
          ].join("\n"),
        },
        {
          role: "user",
          content:
            "Create the final email summary using the required format.\n\n" +
            `Email and attachment content:\n${content}`,
        },
      ],
      {
        model: settings.openrouterEmailModel,
        maxTokens: maxOutputTokens,
        temperature: 0.2,
      },
    );
  } catch (error) {
    return `Error generating summary: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function generateEmailReply(emailContent: string, maxTokens = 2000) {
  try {
    return await chatCompletion(
      [
        {
          role: "system",
          content: [
            "You are an expert email reply writer.",
            "Return exactly one final email reply ready to send.",
            "Do not include reasoning, summaries, commentary, labels like 'Option 1', multiple drafts, alternatives, explanations, markdown fences, or notes to the user.",
            "Do not say that you are an AI or that you reviewed the email.",
            "Write in a professional, concise, helpful tone.",
            "Answer the sender's actual request. If the email is automated/no-reply or does not require a reply, write a short useful note explaining the right next step instead of inventing a reply.",
            "Use attachment/document content when it changes the answer.",
            "Output only the email body. Include greeting and sign-off. Use placeholders only when required information is missing.",
          ].join("\n"),
        },
        {
          role: "user",
          content:
            "Draft one final reply for this email. Use any attachment content included below when relevant.\n\n" +
            emailContent,
        },
      ],
      {
        model: settings.openrouterEmailModel,
        maxTokens,
        temperature: 0.6,
      },
    );
  } catch (error) {
    logger.error("Error generating email reply", error instanceof Error ? error.message : error);
    return `Error generating email reply: ${error instanceof Error ? error.message : String(error)}`;
  }
}
