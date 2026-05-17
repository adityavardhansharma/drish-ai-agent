export type GmailHeader = {
  name?: string | null;
  value?: string | null;
};

export type GmailMessagePart = {
  mimeType?: string | null;
  filename?: string | null;
  headers?: GmailHeader[] | null;
  body?: {
    data?: string | null;
    attachmentId?: string | null;
    size?: number | null;
  } | null;
  parts?: GmailMessagePart[] | null;
};

export type GmailMessage = {
  id?: string | null;
  threadId?: string | null;
  payload?: GmailMessagePart | null;
};

export type ParsedEmail = {
  sender: string;
  subject: string;
  body: string;
  messageId: string;
  attachments: ParsedEmailAttachment[];
};

export type ParsedEmailAttachment = {
  filename: string;
  mimeType: string;
  text: string;
};

export type SavedEmailRecord = {
  id: string;
  created_at: string;
  message_id: string;
  to_email: string;
  from_email: string;
  from_name: string;
  subject: string;
  summary: string;
  reply: string;
  status: string;
  generated_at: string;
  updated_at: string;
  sent_at?: string;
  sent_reply_body?: string;
  gmail_response?: string;
  last_error?: string;
};

export type StreamEvent =
  | { type: "status"; message: string }
  | { type: "error"; message: string }
  | { type: "completed"; success: boolean; message: string }
  | { type: "progress"; current: number; total: number }
  | {
      type: "email_summary";
      data: {
        summary: string;
        reply: string;
        message_id: string;
        to_email: string;
        sender: string;
        from_email: string;
        subject: string;
        saved_record?: SavedEmailRecord;
      };
    };
