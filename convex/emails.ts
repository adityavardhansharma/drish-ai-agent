import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAppSecret } from "./auth";

function publicEmail(record: {
  _id: string;
  _creationTime: number;
  message_id: string;
  to_email: string;
  from_email: string;
  from_name: string;
  subject: string;
  summary: string;
  draft_reply: string;
  status: string;
  generated_at: string;
  updated_at: string;
  sent_at?: string;
  sent_reply_body?: string;
  gmail_response?: string;
  last_error?: string;
}) {
  return {
    id: record._id,
    created_at: new Date(record._creationTime).toISOString(),
    message_id: record.message_id,
    to_email: record.to_email,
    from_email: record.from_email,
    from_name: record.from_name,
    subject: record.subject,
    summary: record.summary,
    reply: record.draft_reply,
    status: record.status,
    generated_at: record.generated_at,
    updated_at: record.updated_at,
    sent_at: record.sent_at,
    sent_reply_body: record.sent_reply_body,
    gmail_response: record.gmail_response,
    last_error: record.last_error,
  };
}

export const listRecent = query({
  args: {
    appSecret: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    requireAppSecret(args.appSecret);

    const boundedLimit = Math.max(1, Math.min(args.limit, 200));
    const records = await ctx.db
      .query("email_summaries")
      .withIndex("by_updated_at")
      .order("desc")
      .take(boundedLimit);

    return records.map(publicEmail);
  },
});

export const upsertSummary = mutation({
  args: {
    appSecret: v.string(),
    messageId: v.string(),
    toEmail: v.string(),
    fromEmail: v.string(),
    fromName: v.string(),
    subject: v.string(),
    summary: v.string(),
    draftReply: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    requireAppSecret(args.appSecret);

    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("email_summaries")
      .withIndex("by_message_id", (q) => q.eq("message_id", args.messageId))
      .unique();

    const patch = {
      to_email: args.toEmail,
      from_email: args.fromEmail,
      from_name: args.fromName,
      subject: args.subject,
      summary: args.summary,
      draft_reply: args.draftReply,
      status: args.status,
      updated_at: now,
      last_error: undefined,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      const updated = await ctx.db.get(existing._id);
      return updated ? publicEmail(updated) : null;
    }

    const id = await ctx.db.insert("email_summaries", {
      message_id: args.messageId,
      generated_at: now,
      ...patch,
    });
    const created = await ctx.db.get(id);
    return created ? publicEmail(created) : null;
  },
});

export const markReplySent = mutation({
  args: {
    appSecret: v.string(),
    messageId: v.string(),
    sentReplyBody: v.string(),
    gmailResponse: v.string(),
  },
  handler: async (ctx, args) => {
    requireAppSecret(args.appSecret);

    const existing = await ctx.db
      .query("email_summaries")
      .withIndex("by_message_id", (q) => q.eq("message_id", args.messageId))
      .unique();

    if (!existing) {
      return null;
    }

    await ctx.db.patch(existing._id, {
      status: "sent",
      sent_at: new Date().toISOString(),
      sent_reply_body: args.sentReplyBody,
      gmail_response: args.gmailResponse,
      updated_at: new Date().toISOString(),
      last_error: undefined,
    });

    const updated = await ctx.db.get(existing._id);
    return updated ? publicEmail(updated) : null;
  },
});

export const updateDraftReply = mutation({
  args: {
    appSecret: v.string(),
    messageId: v.string(),
    draftReply: v.string(),
  },
  handler: async (ctx, args) => {
    requireAppSecret(args.appSecret);

    const existing = await ctx.db
      .query("email_summaries")
      .withIndex("by_message_id", (q) => q.eq("message_id", args.messageId))
      .unique();

    if (!existing) {
      return null;
    }

    await ctx.db.patch(existing._id, {
      draft_reply: args.draftReply,
      status: existing.status === "sent" ? existing.status : "draft_updated",
      updated_at: new Date().toISOString(),
    });

    const updated = await ctx.db.get(existing._id);
    return updated ? publicEmail(updated) : null;
  },
});

export const markReplyFailed = mutation({
  args: {
    appSecret: v.string(),
    messageId: v.string(),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    requireAppSecret(args.appSecret);

    const existing = await ctx.db
      .query("email_summaries")
      .withIndex("by_message_id", (q) => q.eq("message_id", args.messageId))
      .unique();

    if (!existing) {
      return null;
    }

    await ctx.db.patch(existing._id, {
      status: "send_failed",
      last_error: args.errorMessage,
      updated_at: new Date().toISOString(),
    });

    const updated = await ctx.db.get(existing._id);
    return updated ? publicEmail(updated) : null;
  },
});
