import base64
import logging
import email
from email.header import decode_header

logger = logging.getLogger(__name__)

def decode_str(s):
    """Decodes a possibly encoded string header."""
    if s is None:
        return ""
    try:
        decoded_parts = decode_header(s)
        decoded_str = ""
        for part, encoding in decoded_parts:
            if isinstance(part, bytes):
                if encoding:
                    try:
                        decoded_str += part.decode(encoding)
                    except Exception:
                        decoded_str += part.decode("utf-8", errors="replace")
                else:
                    decoded_str += part.decode("utf-8", errors="replace")
            else:
                decoded_str += part
        return decoded_str
    except Exception as e:
        logger.error(f"Error decoding string: {e}")
        return s

def get_body_from_message(message):
    """Extracts the body text from a MIME message."""
    if message.is_multipart():
        # Try plain text parts first.
        for part in message.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition"))
            if "attachment" in content_disposition:
                continue
            if content_type == "text/plain":
                try:
                    return part.get_payload(decode=True).decode("utf-8", errors="replace")
                except Exception as e:
                    logger.error(f"Error decoding plain text part: {e}")
        # Then try HTML parts.
        for part in message.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition"))
            if "attachment" in content_disposition:
                continue
            if content_type == "text/html":
                try:
                    return part.get_payload(decode=True).decode("utf-8", errors="replace")
                except Exception as e:
                    logger.error(f"Error decoding HTML part: {e}")
    else:
        try:
            body = message.get_payload(decode=True)
            if body:
                return body.decode("utf-8", errors="replace")
        except Exception as e:
            logger.error(f"Error decoding non-multipart message: {e}")
    return "No readable content found"

def parse_email_content(email_data):
    """
    Parses email data from the Gmail API and extracts sender, subject, and body.
    """
    try:
        payload = email_data.get("payload", {})
        headers = payload.get("headers", [])
        sender = next((h["value"] for h in headers if h["name"].lower() == "from"), "Unknown Sender")
        subject = next((h["value"] for h in headers if h["name"].lower() == "subject"), "No Subject")
        sender = decode_str(sender)
        subject = decode_str(subject)

        body = ""
        if "body" in payload and "data" in payload["body"]:
            try:
                body = base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8", errors="replace")
            except Exception as e:
                logger.error(f"Error decoding body data: {e}")
        if not body and "parts" in payload:
            for part in payload["parts"]:
                if part.get("mimeType") == "text/plain" and "body" in part and "data" in part["body"]:
                    try:
                        body = base64.urlsafe_b64decode(part["body"]["data"]).decode("utf-8", errors="replace")
                        break
                    except Exception as e:
                        logger.error(f"Error decoding part data: {e}")
        if not body and "parts" in payload:
            for part in payload["parts"]:
                if part.get("mimeType") == "text/html" and "body" in part and "data" in part["body"]:
                    try:
                        body = base64.urlsafe_b64decode(part["body"]["data"]).decode("utf-8", errors="replace")
                        break
                    except Exception as e:
                        logger.error(f"Error decoding HTML part data: {e}")
        body = body.strip()
        return {"sender": sender, "subject": subject, "body": body}
    except Exception as e:
        logger.exception(f"Error parsing email: {e}")
        return None
