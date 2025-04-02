#!/usr/bin/env python
import os
import sys
import json
import logging
import asyncio
import uuid

from flask import (
    Flask,
    request,
    jsonify,
    Response,
    render_template,
    session,
    stream_with_context,
    url_for,
    send_from_directory,
)
from werkzeug.utils import secure_filename

# Import business-logic functions & API wrappers.
from email_utils.gmail_api import get_gmail_service, fetch_emails, send_reply
from email_utils.email_parser import parse_email_content
from llm.gemini_api import generate_summary as generate_email_summary
from llm.mistral_reply_api import generate_email_reply as generate_mistral_reply
from llm.mistral_api import generate_summary as generate_doc_summary
from llm.chat_api import chat_with_document, ChatMessage
from llm.gemini_object_detection import detect_objects

# --- Config and Logger Setup ---
try:
    from utils.config import settings
    from utils.logger import setup_logger

    logger = setup_logger()
except ImportError as e:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    logger = logging.getLogger(__name__)
    logger.warning(f"Falling back to basic logging. Details: {e}")


    class FallbackSettings:
        gemini_api_key = os.environ.get("GEMINI_API_KEY")
        mistral_api_key = os.environ.get("MISTRAL_API_KEY")
        HOST = os.environ.get("HOST", "0.0.0.0")
        PORT = int(os.environ.get("PORT", 5000))
        DEBUG = os.environ.get("FLASK_DEBUG", "1") == "1"
        SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", "dev-secret-key")


    settings = FallbackSettings()

if not settings.gemini_api_key and not settings.mistral_api_key:
    logger.error("Neither GEMINI_API_KEY nor MISTRAL_API_KEY set.")
    print("Error: API keys missing. Set GEMINI_API_KEY or MISTRAL_API_KEY.")
    sys.exit(1)

UPLOAD_FOLDER = "uploads"
ALLOWED_EXTENSIONS_DOC = {"pdf", "docx", "doc", "txt"}
ALLOWED_EXTENSIONS_IMG = {"png", "jpg", "jpeg", "bmp"}


def allowed_file(filename, allowed_extensions):
    return (
            "." in filename and filename.rsplit(".", 1)[1].lower() in allowed_extensions
    )


def extract_text_from_pdf(pdf_path):
    import PyPDF2
    text = ""
    with open(pdf_path, "rb") as f:
        pdf_reader = PyPDF2.PdfReader(f)
        if pdf_reader.is_encrypted:
            try:
                pdf_reader.decrypt("")
            except Exception as de:
                logger.error(f"Decrypt error for {pdf_path}: {de}")
                raise ValueError(f"PDF file '{os.path.basename(pdf_path)}' is encrypted.")
        for page in pdf_reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    return text


def extract_text_from_docx(docx_path):
    import docx
    doc = docx.Document(docx_path)
    text = ""
    for para in doc.paragraphs:
        text += para.text + "\n"
    return text


def extract_text_from_file(file_path):
    _, file_extension = os.path.splitext(file_path)
    file_extension = file_extension.lower()
    if file_extension == ".pdf":
        return extract_text_from_pdf(file_path)
    elif file_extension in [".docx", ".doc"]:
        return extract_text_from_docx(file_path)
    elif file_extension == ".txt":
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        except UnicodeDecodeError:
            with open(file_path, "r", encoding="latin-1") as f:
                return f.read()
    else:
        raise ValueError(f"Unsupported file type: {file_extension}")


# --- Business Logic Functions ---

async def process_fetch_emails():
    yield json.dumps({"type": "status", "message": "Authenticating with Gmail..."})
    service = get_gmail_service()
    if not service:
        yield json.dumps({"type": "error", "message": "Failed to authenticate with Gmail."})
        return
    yield json.dumps({"type": "status", "message": "Fetching unread emails..."})
    emails = fetch_emails(service)  # adjust max_results if needed
    if not emails:
        yield json.dumps({"type": "status", "message": "No new emails found."})
        yield json.dumps({"type": "completed", "success": True, "message": "No new emails."})
        return
    total = len(emails)
    yield json.dumps({"type": "status", "message": f"Processing {total} emails..."})
    yield json.dumps({"type": "progress", "current": 0, "total": total})
    processed = 0
    for i, email_data in enumerate(emails):
        try:
            yield json.dumps({"type": "status", "message": f"Parsing email {i + 1}/{total}..."})
            parsed = parse_email_content(email_data)
            if not parsed:
                logger.error(f"Email {i + 1}/{total} parse error")
                continue
            content = f"Subject: {parsed['subject']}\nFrom: {parsed['sender']}\nBody: {parsed['body']}"
            yield json.dumps({"type": "status", "message": f"Summarizing email {i + 1}/{total}..."})
            # Call the Gemini API synchronously (assumed synchronous)
            summary = generate_email_summary(content)
            # Call the Mistral API asynchronously and await it
            reply = await generate_mistral_reply(content)
            payload = {
                "summary": f"From: {parsed['sender']}\nSubject: {parsed['subject']}\nMessage ID: {parsed.get('message_id', 'N/A')}\n\nSummary:\n{summary}",
                "reply": reply,
                "message_id": parsed.get("message_id", ""),
                "to_email": parsed["sender"],
                "subject": parsed["subject"],
            }
            yield json.dumps({"type": "email_summary", "data": payload})
            processed += 1
            yield json.dumps({"type": "progress", "current": processed, "total": total})
            logger.info(f"Processed email {i + 1}/{total}")
        except Exception as e:
            logger.error(f"Processing error on email {i + 1}: {e}")
            yield json.dumps({"type": "error", "message": f"Error processing email {i + 1}: {str(e)}"})
            yield json.dumps({"type": "progress", "current": processed, "total": total})
    yield json.dumps({"type": "status", "message": f"Completed processing {processed}/{total} emails."})
    yield json.dumps({"type": "completed", "success": True, "message": "Email fetch complete."})


async def process_send_email(message_id, to_email, subject, body):
    service = get_gmail_service()
    if not service:
        return False, "Failed to authenticate with Gmail."
    reply_subject = subject if subject.lower().startswith("re:") else f"Re: {subject}"
    success, response = send_reply(service, message_id, to_email, reply_subject, body)
    if success:
        return True, "Email sent successfully!"
    else:
        return False, f"Failed to send email: {response}"


async def process_document_summary(file_path):
    try:
        content = extract_text_from_file(file_path)
        session["document_content"] = content
        session["chat_history"] = []
        # Await the async generate_summary function
        summary = await generate_doc_summary(content)
        return {"success": True, "summary": summary}
    except Exception as e:
        logger.error(f"Document summarization error: {e}")
        return {"success": False, "error": str(e)}


async def process_document_chat(question):
    try:
        content = session.get("document_content")
        if not content:
            return {
                "success": False,
                "error": "No document loaded. Please upload and summarize first."
            }

        history_serializable = session.get("chat_history", [])
        chat_history = [ChatMessage(**msg) for msg in history_serializable]

        response = await chat_with_document(question, content, chat_history)

        if response.error:
            return {
                "success": False,
                "error": response.error
            }

        # Update chat history
        history_serializable.extend([
            ChatMessage(role="user", content=question).dict(),
            ChatMessage(role="assistant", content=response.answer).dict()
        ])
        session["chat_history"] = history_serializable
        session.modified = True

        return {
            "success": True,
            "answer": response.answer
        }

    except Exception as e:
        logger.error(f"Error in process_document_chat: {e}")
        return {
            "success": False,
            "error": str(e)
        }


async def process_object_detection(image_path):
    if not os.path.exists(image_path):
        return {"success": False, "error": "Image file not found."}
    try:
        result = await detect_objects(image_path)
        return {"success": True, "result": result}
    except Exception as e:
        logger.error(f"Object detection error: {e}")
        return {"success": False, "error": str(e)}


# --- Flask App Setup ---
app = Flask(__name__)
app.secret_key = getattr(settings, "SECRET_KEY", "dev-secret-key")
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


# --- HTML Routes ---
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/email")
def email_agent():
    session.clear()
    return render_template("email_summarizer.html")


@app.route("/document")
def document_agent():
    session.pop("chat_history", None)
    file_name = (
        os.path.basename(session["selected_doc_path"])
        if "selected_doc_path" in session and os.path.exists(session["selected_doc_path"])
        else None
    )
    return render_template("document_summary.html", uploaded_file=file_name)


@app.route("/object")
def object_agent():
    session.pop("document_content", None)
    session.pop("chat_history", None)
    file_name = (
        os.path.basename(session["selected_img_path"])
        if "selected_img_path" in session and os.path.exists(session["selected_img_path"])
        else None
    )
    return render_template("object_detection.html", uploaded_image=file_name)


# --- API Routes ---

# SSE endpoint: wrap async generator in a synchronous generator.
@app.route("/api/emails/fetch", methods=["GET"])
def api_fetch_emails():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    async_gen = process_fetch_emails()

    def generate():
        try:
            while True:
                chunk = loop.run_until_complete(async_gen.__anext__())
                yield f"data: {chunk}\n\n"
        except StopAsyncIteration:
            loop.close()

    return Response(generate(), mimetype="text/event-stream")


@app.route("/api/emails/reply", methods=["POST"])
def api_send_email():
    data = request.json
    message_id = data.get("message_id")
    to_email = data.get("to_email")
    subject = data.get("subject")
    body = data.get("reply_text")
    if not all([message_id, to_email, subject, body]):
        return jsonify({"success": False, "message": "Missing required fields."}), 400
    success, msg = asyncio.run(process_send_email(message_id, to_email, subject, body))
    return jsonify({"success": success, "message": msg})


@app.route("/api/emails/generate_reply", methods=["POST"])
def api_generate_reply():
    data = request.json
    email_content = data.get("email_content")
    if not email_content:
        return jsonify({"success": False, "error": "Missing email content."}), 400
    try:
        reply = asyncio.run(generate_mistral_reply(email_content))
        return jsonify({"success": True, "reply": reply})
    except Exception as e:
        logger.error(f"Reply generation error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/documents/upload", methods=["POST"])
def api_upload_document():
    if "document" not in request.files:
        return jsonify({"success": False, "error": "No document file provided."}), 400
    file = request.files["document"]
    if file.filename == "":
        return jsonify({"success": False, "error": "No selected file."}), 400
    if file and allowed_file(file.filename, ALLOWED_EXTENSIONS_DOC):
        filename = secure_filename(file.filename)
        unique_filename = f"{uuid.uuid4()}_{filename}"
        save_path = os.path.join(app.config["UPLOAD_FOLDER"], unique_filename)
        try:
            file.save(save_path)
            session["selected_doc_path"] = save_path
            session.pop("document_content", None)
            session.pop("chat_history", None)
            return jsonify({"success": True, "filename": filename})
        except Exception as e:
            logger.error(f"Doc upload error: {e}")
            return jsonify({"success": False, "error": str(e)}), 500
    return jsonify({"success": False, "error": "File type not allowed."}), 400


@app.route("/api/documents/summarize", methods=["POST"])
async def api_summarize_document():
    file_path = session.get("selected_doc_path")
    if not file_path or not os.path.exists(file_path):
        return jsonify({"success": False, "error": "Document not found."}), 400

    try:
        content = extract_text_from_file(file_path)
        # Explicitly store the content in session
        session["document_content"] = content
        session["chat_history"] = []
        session.modified = True  # Ensure session is marked as modified

        summary = await generate_doc_summary(content)

        return jsonify({
            "success": True,
            "summary": str(summary)
        })
    except Exception as e:
        logger.error(f"Error in document summarization: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route("/api/documents/chat", methods=["POST"])
async def api_chat_document():
    try:
        data = request.json
        question = data.get("question")

        if not question:
            return jsonify({
                "success": False,
                "error": "No question provided"
            }), 400

        # Debug logging
        logger.debug(f"Session contents: {dict(session)}")
        content = session.get("document_content")

        if not content:
            logger.error("Document content not found in session")
            return jsonify({
                "success": False,
                "error": "Document content not found. Please try summarizing the document again."
            }), 400

        result = await process_document_chat(question)

        if isinstance(result, dict):
            if "error" in result:
                return jsonify({
                    "success": False,
                    "error": result["error"]
                })
            elif "answer" in result:
                return jsonify({
                    "success": True,
                    "answer": result["answer"]
                })

        return jsonify({
            "success": True,
            "answer": str(result)
        })

    except Exception as e:
        logger.error(f"Error in chat processing: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route("/api/objects/upload", methods=["POST"])
def api_upload_image():
    if "image" not in request.files:
        return jsonify({"success": False, "error": "No image file provided."}), 400
    file = request.files["image"]
    if file.filename == "":
        return jsonify({"success": False, "error": "No selected file."}), 400
    if file and allowed_file(file.filename, ALLOWED_EXTENSIONS_IMG):
        filename = secure_filename(file.filename)
        unique_filename = f"{uuid.uuid4()}_{filename}"
        save_path = os.path.join(app.config["UPLOAD_FOLDER"], unique_filename)
        try:
            file.save(save_path)
            session["selected_img_path"] = save_path
            return jsonify({"success": True, "filename": filename})
        except Exception as e:
            logger.error(f"Image upload error: {e}")
            return jsonify({"success": False, "error": str(e)}), 500
    return jsonify({"success": False, "error": "File type not allowed."}), 400


@app.route("/api/objects/detect", methods=["POST"])
def api_detect_objects():
    image_path = session.get("selected_img_path")
    if not image_path or not os.path.exists(image_path):
        return jsonify({"success": False, "error": "Image not found."}), 400
    result = asyncio.run(process_object_detection(image_path))
    return jsonify(result)


@app.route("/uploads/<filename>")
def uploaded_file(filename):
    safe_filename = secure_filename(filename)
    if safe_filename != filename:
        return "Invalid filename", 400
    try:
        return send_from_directory(app.config["UPLOAD_FOLDER"], safe_filename, as_attachment=False)
    except FileNotFoundError:
        return "File not found", 404


# --- Main Execution ---
if __name__ == "__main__":
    host = getattr(settings, "HOST", "0.0.0.0")
    port = int(getattr(settings, "PORT", 5000))
    debug_mode = getattr(settings, "DEBUG", True)
    logger.info(f"Starting Flask server on {host}:{port} (Debug: {debug_mode})")
    app.run(host=host, port=port, debug=debug_mode)
