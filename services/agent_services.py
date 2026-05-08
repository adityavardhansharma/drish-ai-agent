import json
import logging
import os
from email.utils import parseaddr

from email_utils.gmail_api import get_gmail_service, fetch_emails, send_reply
from email_utils.email_parser import parse_email_content
from leave_utils.db import create_user, authenticate_user
from leave_utils.llm import format_leave_details
from leave_utils.sheets import get_employee_leave_data
from llm.chat_api import ChatMessage, chat_with_document
from llm.email_summary_api import generate_summary as generate_email_summary
from llm.object_detection_api import detect_objects
from llm.document_summary_api import generate_summary as generate_doc_summary
from llm.email_reply_api import generate_email_reply
from services.document_store import document_store
from services.email_artifact_store import (
    list_email_summaries,
    mark_email_reply_failed,
    mark_email_reply_sent,
    save_email_summary,
    update_email_draft,
)
from services.file_extraction import extract_text_from_file

logger = logging.getLogger(__name__)


async def process_fetch_emails():
    yield json.dumps({"type": "status", "message": "Authenticating with Gmail..."})
    service = get_gmail_service()
    if not service:
        yield json.dumps(
            {"type": "error", "message": "Failed to authenticate with Gmail."}
        )
        return

    yield json.dumps({"type": "status", "message": "Fetching unread emails..."})
    emails = fetch_emails(service)
    if not emails:
        yield json.dumps({"type": "status", "message": "No new emails found."})
        yield json.dumps(
            {"type": "completed", "success": True, "message": "No new emails."}
        )
        return

    total = len(emails)
    yield json.dumps({"type": "status", "message": f"Processing {total} emails..."})
    yield json.dumps({"type": "progress", "current": 0, "total": total})

    processed = 0
    for i, email_data in enumerate(emails):
        try:
            yield json.dumps(
                {"type": "status", "message": f"Parsing email {i + 1}/{total}..."}
            )
            parsed = parse_email_content(email_data)
            if not parsed:
                logger.error("Email %s/%s parse error", i + 1, total)
                continue

            content = (
                f"Subject: {parsed['subject']}\n"
                f"From: {parsed['sender']}\n"
                f"Body: {parsed['body']}"
            )
            yield json.dumps(
                {
                    "type": "status",
                    "message": f"Summarizing email {i + 1}/{total}...",
                }
            )
            summary = generate_email_summary(content)
            reply = await generate_email_reply(content)
            payload = {
                "summary": (
                    f"From: {parsed['sender']}\n"
                    f"Subject: {parsed['subject']}\n"
                    f"Message ID: {parsed.get('message_id', 'N/A')}\n\n"
                    f"Summary:\n{summary}"
                ),
                "reply": reply,
                "message_id": parsed.get("message_id", ""),
                "to_email": parsed["sender"],
                "sender": parsed["sender"],
                "from_email": parseaddr(parsed["sender"])[1],
                "subject": parsed["subject"],
            }
            saved_record = save_email_summary(payload)
            if saved_record:
                payload["saved_record"] = saved_record
            yield json.dumps({"type": "email_summary", "data": payload})
            processed += 1
            yield json.dumps(
                {"type": "progress", "current": processed, "total": total}
            )
            logger.info("Processed email %s/%s", i + 1, total)
        except Exception as error:
            logger.error("Processing error on email %s: %s", i + 1, error)
            yield json.dumps(
                {
                    "type": "error",
                    "message": f"Error processing email {i + 1}: {str(error)}",
                }
            )
            yield json.dumps(
                {"type": "progress", "current": processed, "total": total}
            )

    yield json.dumps(
        {
            "type": "status",
            "message": f"Completed processing {processed}/{total} emails.",
        }
    )
    yield json.dumps(
        {"type": "completed", "success": True, "message": "Email fetch complete."}
    )


async def process_send_email(message_id, to_email, subject, body):
    service = get_gmail_service()
    if not service:
        return False, "Failed to authenticate with Gmail."

    reply_subject = subject if subject.lower().startswith("re:") else f"Re: {subject}"
    success, response = send_reply(service, message_id, to_email, reply_subject, body)
    if success:
        mark_email_reply_sent(message_id, body, response)
        return True, "Email sent successfully!"
    mark_email_reply_failed(message_id, str(response))
    return False, f"Failed to send email: {response}"


def process_list_email_summaries(limit=100):
    return list_email_summaries(limit=limit)


def process_update_email_draft(message_id, draft_reply):
    return update_email_draft(message_id, draft_reply)


async def process_document_summary(session_id, file_path):
    try:
        content = extract_text_from_file(file_path)
        document_store.set_document(session_id, content)
        summary = await generate_doc_summary(content)
        return {"success": True, "summary": summary, "document_content": content}
    except Exception as error:
        logger.error("Document summarization error: %s", error)
        return {"success": False, "error": str(error)}


async def process_document_chat(session_id, question):
    try:
        content = document_store.get_document(session_id)
        if not content:
            return {
                "success": False,
                "error": "No document loaded. Please upload and summarize first.",
            }

        chat_history = [
            ChatMessage(**message)
            for message in document_store.get_chat_history(session_id)
        ]
        response = await chat_with_document(question, content, chat_history)
        if response.error:
            return {"success": False, "error": response.error}

        updated_history = document_store.append_chat_turn(
            session_id,
            ChatMessage(role="user", content=question).dict(),
            ChatMessage(role="assistant", content=response.answer).dict(),
        )
        return {
            "success": True,
            "answer": response.answer,
            "chat_history": updated_history,
        }
    except Exception as error:
        logger.error("Error in document chat: %s", error)
        return {"success": False, "error": str(error)}


async def process_object_detection(image_path):
    if not os.path.exists(image_path):
        return {"success": False, "error": "Image file not found."}
    try:
        result = await detect_objects(image_path)
        return {"success": True, "result": result}
    except Exception as error:
        logger.error("Object detection error: %s", error)
        return {"success": False, "error": str(error)}


def process_leave_signup(title, name, email, password):
    try:
        return create_user(email, password, name, title)
    except Exception as error:
        logger.error("Error during leave checker signup: %s", error)
        return {"success": False, "error": str(error)}


def process_leave_login(email, password):
    try:
        return authenticate_user(email, password)
    except Exception as error:
        logger.error("Error during leave checker login: %s", error)
        return {"success": False, "error": str(error)}


def process_leave_check(employee_name, month):
    try:
        leave_data = get_employee_leave_data(employee_name, month)
        if not leave_data["success"]:
            return leave_data

        data = leave_data["data"]
        formatted_data = format_leave_details(
            data["employee_name"], data["header_row"], data["employee_row"]
        )
        return {"success": True, "formattedData": formatted_data}
    except Exception as error:
        logger.error("Error checking leave details: %s", error)
        return {"success": False, "error": str(error)}
