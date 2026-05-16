import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  email_summaries: defineTable({
    message_id: v.string(),
    to_email: v.string(),
    from_email: v.string(),
    from_name: v.string(),
    subject: v.string(),
    summary: v.string(),
    draft_reply: v.string(),
    status: v.string(),
    generated_at: v.string(),
    updated_at: v.string(),
    sent_at: v.optional(v.string()),
    sent_reply_body: v.optional(v.string()),
    gmail_response: v.optional(v.string()),
    last_error: v.optional(v.string()),
  })
    .index("by_message_id", ["message_id"])
    .index("by_updated_at", ["updated_at"]),
});
