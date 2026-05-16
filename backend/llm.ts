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
          content: "Summarize emails concisely and factually, including action items.",
        },
        {
          role: "user",
          content:
            "Summarize the following email content in 5-10 sentences. Focus on main points, key information, and requests.\n\n" +
            `Email Content:\n${content}`,
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
    const prompt = `
Based On the Content of the Email :
${emailContent}
Generate a professional and concise email reply for the following email it should not repeat the content of the email and should be a reply to the email such that it gives answer to all the questions aked on the email or properly analzye the content and give a proffesional reply that actually helps the sender of the email.
`;
    return await chatCompletion(
      [
        {
          role: "system",
          content: "You are an email assistant that drafts professional replies.",
        },
        {
          role: "user",
          content: prompt,
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
