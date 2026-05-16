import logging
from email.utils import parseaddr

from services.convex_store import convex_args, convex_client

logger = logging.getLogger(__name__)


def split_sender(sender):
    name, address = parseaddr(sender or "")
    return {
        "from_name": name or sender or "Unknown",
        "from_email": address or "",
    }


def save_email_summary(payload):
    message_id = payload.get("message_id")
    if not message_id:
        logger.warning("Skipping email summary persistence: missing message_id")
        return None

    client = convex_client()
    if not client:
        logger.warning("Skipping email summary persistence: Convex unavailable")
        return None

    try:
        sender = split_sender(payload.get("sender") or payload.get("to_email"))
        return client.mutation(
            "emails:upsertSummary",
            convex_args(
                messageId=message_id,
                toEmail=payload.get("to_email", ""),
                fromEmail=sender["from_email"],
                fromName=sender["from_name"],
                subject=payload.get("subject", ""),
                summary=payload.get("summary", ""),
                draftReply=payload.get("reply", ""),
                status="generated",
            ),
        )
    except Exception as error:
        logger.error("Error saving email summary to Convex: %s", error)
        return None


def list_email_summaries(limit=100):
    client = convex_client()
    if not client:
        return {"success": False, "error": "Convex connection not available", "data": []}

    try:
        records = client.query(
            "emails:listRecent",
            convex_args(limit=limit),
        )
        return {"success": True, "data": records or []}
    except Exception as error:
        logger.error("Error loading email summaries from Convex: %s", error)
        return {"success": False, "error": str(error), "data": []}


def mark_email_reply_sent(message_id, sent_reply_body, gmail_response):
    if not message_id:
        logger.warning("Skipping sent email persistence: missing message_id")
        return None

    client = convex_client()
    if not client:
        logger.warning("Skipping sent email persistence: Convex unavailable")
        return None

    try:
        return client.mutation(
            "emails:markReplySent",
            convex_args(
                messageId=message_id,
                sentReplyBody=sent_reply_body or "",
                gmailResponse=str(gmail_response or ""),
            ),
        )
    except Exception as error:
        logger.error("Error marking email reply sent in Convex: %s", error)
        return None


def update_email_draft(message_id, draft_reply):
    if not message_id:
        return {"success": False, "error": "message_id is required"}

    client = convex_client()
    if not client:
        return {"success": False, "error": "Convex connection not available"}

    try:
        record = client.mutation(
            "emails:updateDraftReply",
            convex_args(
                messageId=message_id,
                draftReply=draft_reply or "",
            ),
        )
        return {"success": True, "data": record}
    except Exception as error:
        logger.error("Error updating email draft in Convex: %s", error)
        return {"success": False, "error": str(error)}


def mark_email_reply_failed(message_id, error_message):
    if not message_id:
        logger.warning("Skipping failed email persistence: missing message_id")
        return None

    client = convex_client()
    if not client:
        return None

    try:
        return client.mutation(
            "emails:markReplyFailed",
            convex_args(
                messageId=message_id,
                errorMessage=error_message or "",
            ),
        )
    except Exception as error:
        logger.error("Error marking email reply failed in Convex: %s", error)
        return None
