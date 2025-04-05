#!/usr/bin/env python
import os
import sys
import json
import logging
import asyncio
import uuid
import aiofiles
import aiohttp
import base64
import re
import shutil
from io import BytesIO
from pathlib import Path
from dotenv import load_dotenv
from functools import wraps
from datetime import datetime

# Check if running in Electron
ELECTRON_APP = os.environ.get("ELECTRON_APP", "0") == "1"

# Adjust paths if running in Electron
if ELECTRON_APP and getattr(sys, 'frozen', False):
    # Running as bundled executable
    application_path = os.path.dirname(sys.executable)
    os.chdir(application_path)
    if not os.path.exists("uploads"):
        os.makedirs("uploads", exist_ok=True)
elif ELECTRON_APP:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

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
    abort
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

# Import leave checker utilities
from leave_utils.db import create_user, authenticate_user
from leave_utils.sheets import get_employee_leave_data
from leave_utils.llm import format_leave_details

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
        HOST = os.environ.get("HOST", "127.0.0.1")
        PORT = int(os.environ.get("PORT", 5000))
        DEBUG = os.environ.get("FLASK_DEBUG", "0") == "1"
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

# --- Global Desktop Storage Variables ---
# Instead of storing large data in session cookies, we store them in memory.
DOCUMENT_CONTENT = None
CHAT_HISTORY = []

# --- Business Logic Functions ---

async def process_fetch_emails():
    yield json.dumps({"type": "status", "message": "Authenticating with Gmail..."})
    service = get_gmail_service()
    if not service:
        yield json.dumps({"type": "error", "message": "Failed to authenticate with Gmail."})
        return
    yield json.dumps({"type": "status", "message": "Fetching unread emails..."})
    emails = fetch_emails(service)
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
            summary = generate_email_summary(content)
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
    global DOCUMENT_CONTENT, CHAT_HISTORY
    try:
        content = extract_text_from_file(file_path)
        DOCUMENT_CONTENT = content          # Save in desktop memory instead
        CHAT_HISTORY = []                   # Reset chat history
        summary = await generate_doc_summary(content)
        # Return the content along with the summary so that the renderer can store it
        return {"success": True, "summary": summary, "document_content": content}
    except Exception as e:
        logger.error(f"Document summarization error: {e}")
        return {"success": False, "error": str(e)}

async def process_document_chat(question):
    global DOCUMENT_CONTENT, CHAT_HISTORY
    try:
        content = DOCUMENT_CONTENT  # Retrieve from desktop memory
        if not content:
            return {"success": False, "error": "No document loaded. Please upload and summarize first."}
        # Convert stored chat history into ChatMessage objects
        chat_history = [ChatMessage(**msg) for msg in CHAT_HISTORY]
        response = await chat_with_document(question, content, chat_history)
        if response.error:
            return {"success": False, "error": response.error}
        # Update desktop memory with the latest chat entries
        CHAT_HISTORY.extend([
            ChatMessage(role="user", content=question).dict(),
            ChatMessage(role="assistant", content=response.answer).dict()
        ])
        return {"success": True, "answer": response.answer, "chat_history": CHAT_HISTORY}
    except Exception as e:
        logger.error(f"Error in process_document_chat: {e}")
        return {"success": False, "error": str(e)}

async def process_object_detection(image_path):
    if not os.path.exists(image_path):
        return {"success": False, "error": "Image file not found."}
    try:
        result = await detect_objects(image_path)
        return {"success": True, "result": result}
    except Exception as e:
        logger.error(f"Object detection error: {e}")
        return {"success": False, "error": str(e)}

def process_leave_signup(title, name, email, password):
    try:
        result = create_user(email, password, name, title)
        return result
    except Exception as e:
        logger.error(f"Error during leave checker signup: {e}")
        return {"success": False, "error": str(e)}

def process_leave_login(email, password):
    try:
        result = authenticate_user(email, password)
        return result
    except Exception as e:
        logger.error(f"Error during leave checker login: {e}")
        return {"success": False, "error": str(e)}

def process_leave_check(employee_name, month):
    try:
        leave_data = get_employee_leave_data(employee_name, month)
        if not leave_data["success"]:
            return leave_data
        data = leave_data["data"]
        formatted_data = format_leave_details(
            data["employee_name"],
            data["header_row"],
            data["employee_row"]
        )
        return {"success": True, "formattedData": formatted_data}
    except Exception as e:
        logger.error(f"Error checking leave details: {e}")
        return {"success": False, "error": str(e)}

# --- Flask App Setup ---
app = Flask(__name__)
app.secret_key = getattr(settings, "SECRET_KEY", "dev-secret-key")
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# --- Main Routes ---
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/email")
def email_agent():
    return render_template("email_summarizer.html")

@app.route("/document")
def document_agent():
    document_name = session.get("document_name", "No document loaded")
    chat_history = session.get("chat_history", [])
    chat_context = {
        "document_name": document_name,
        "has_summary": "document_content" in session and session["document_content"],
    }
    return render_template("document_summary.html", **chat_context)

@app.route("/object")
def object_agent():
    return render_template("object_detection.html")

@app.route("/leave")
def leave_agent():
    return render_template("leave_checker.html")

# --- Email Endpoints ---
@app.route("/api/emails/fetch", methods=["GET"])
def api_fetch_emails():
    @stream_with_context
    def generate():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        async_gen = process_fetch_emails()
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
    message_id = data.get("message_id", "")
    to_email = data.get("to_email", "")
    subject = data.get("subject", "")
    body = data.get("body", "")
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        success, message = loop.run_until_complete(process_send_email(message_id, to_email, subject, body))
        loop.close()
        return jsonify({"success": success, "message": message})
    except Exception as e:
        logger.exception(f"Error sending email: {e}")
        return jsonify({"success": False, "message": f"Error sending email: {str(e)}"})

@app.route("/api/emails/generate_reply", methods=["POST"])
def api_generate_reply():
    data = request.json
    email_content = data.get("email_content", "")
    if not email_content:
        return jsonify({"success": False, "error": "Email content is required"})
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        reply = loop.run_until_complete(generate_mistral_reply(email_content))
        loop.close()
        return jsonify({"success": True, "reply": reply})
    except Exception as e:
        logger.exception(f"Error generating reply: {e}")
        return jsonify({"success": False, "error": f"Error generating reply: {str(e)}"})

# --- Document Endpoints ---
@app.route("/api/documents/upload", methods=["POST"])
def api_upload_document():
    if "file" not in request.files:
        return jsonify({"success": False, "error": "No file part"})
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"success": False, "error": "No selected file"})
    if not file or not allowed_file(file.filename, ALLOWED_EXTENSIONS_DOC):
        return jsonify({"success": False, "error": "Invalid file type"})
    filename = secure_filename(file.filename)
    file_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(file_path)
    session["document_name"] = filename
    session["document_path"] = file_path
    return jsonify({"success": True, "filename": filename})

@app.route("/api/documents/summarize", methods=["POST"])
def api_summarize_document():
    file_path = session.get("document_path")
    if not file_path or not os.path.exists(file_path):
        return jsonify({"success": False, "error": "No document uploaded or file not found"})
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(process_document_summary(file_path))
        loop.close()
        return jsonify(result)
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)})
    except Exception as e:
        logger.exception("Error during document summarization")
        return jsonify({"success": False, "error": f"Summarization failed: {str(e)}"})

@app.route("/api/documents/chat", methods=["POST"])
def api_chat_document():
    data = request.json
    question = data.get("question", "").strip()
    if not question:
        return jsonify({"success": False, "error": "Question is required"})
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(process_document_chat(question))
        loop.close()
        return jsonify(result)
    except Exception as e:
        logger.exception(f"Error in chat processing: {e}")
        return jsonify({"success": False, "error": str(e)})

# --- Object Detection Endpoints ---
@app.route("/api/objects/upload", methods=["POST"])
def api_upload_image():
    if "file" not in request.files:
        return jsonify({"success": False, "error": "No file part"})
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"success": False, "error": "No selected file"})
    if not file or not allowed_file(file.filename, ALLOWED_EXTENSIONS_IMG):
        return jsonify({"success": False, "error": "Invalid file type"})
    filename = secure_filename(file.filename)
    file_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(file_path)
    return jsonify({"success": True, "filename": filename, "path": file_path})

@app.route("/api/objects/detect", methods=["POST"])
def api_detect_objects():
    data = request.json
    image_path = os.path.join(app.config["UPLOAD_FOLDER"], data.get("filename", ""))
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(process_object_detection(image_path))
        loop.close()
        return jsonify(result)
    except Exception as e:
        logger.exception(f"Error detecting objects: {e}")
        return jsonify({"success": False, "error": f"Error detecting objects: {str(e)}"})

# --- Leave Checker Endpoints ---
@app.route("/api/leave/signup", methods=["POST"])
def api_leave_signup():
    data = request.json
    title = data.get("title", "")
    name = data.get("name", "")
    email = data.get("email", "")
    password = data.get("password", "")
    if not title or not name or not email or not password:
        return jsonify({"success": False, "error": "All fields are required"})
    result = process_leave_signup(title, name, email, password)
    return jsonify(result)

@app.route("/api/leave/login", methods=["POST"])
def api_leave_login():
    data = request.json
    email = data.get("email", "")
    password = data.get("password", "")
    if not email or not password:
        return jsonify({"success": False, "error": "Email and password are required"})
    result = process_leave_login(email, password)
    return jsonify(result)

@app.route("/api/leave/check", methods=["POST"])
def api_leave_check():
    data = request.json
    employee_name = data.get("employeeName", "")
    month = data.get("month", "")
    if not employee_name or not month:
        return jsonify({"success": False, "error": "Employee name and month are required"})
    result = process_leave_check(employee_name, month)
    return jsonify(result)

@app.route("/uploads/<filename>")
def uploaded_file(filename):
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

if __name__ == "__main__":
    host = getattr(settings, "HOST", "127.0.0.1")
    port = getattr(settings, "PORT", 5000)
    debug = getattr(settings, "DEBUG", False)
    app.run(host=host, port=port, debug=debug)
