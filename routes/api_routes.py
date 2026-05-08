import asyncio
import os
import uuid

from flask import (
    Blueprint,
    Response,
    current_app,
    jsonify,
    request,
    send_from_directory,
    session,
    stream_with_context,
)
from werkzeug.utils import secure_filename

from llm.email_reply_api import generate_email_reply
from services.agent_services import (
    process_document_chat,
    process_document_summary,
    process_fetch_emails,
    process_list_email_summaries,
    process_leave_check,
    process_leave_login,
    process_leave_signup,
    process_object_detection,
    process_send_email,
    process_update_email_draft,
)
from services.file_extraction import (
    ALLOWED_DOCUMENT_EXTENSIONS,
    ALLOWED_IMAGE_EXTENSIONS,
    allowed_file,
)

api_bp = Blueprint("api", __name__)


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(coro)
    finally:
        loop.close()
        asyncio.set_event_loop(None)


def _document_session_id():
    session_id = session.get("document_session_id")
    if not session_id:
        session_id = uuid.uuid4().hex
        session["document_session_id"] = session_id
    return session_id


@api_bp.route("/api/emails/fetch", methods=["GET"])
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
            pass
        finally:
            loop.close()
            asyncio.set_event_loop(None)

    return Response(generate(), mimetype="text/event-stream")


@api_bp.route("/api/emails/summaries", methods=["GET"])
def api_list_email_summaries():
    try:
        limit = int(request.args.get("limit", "100"))
    except ValueError:
        limit = 100
    return jsonify(process_list_email_summaries(limit=limit))


@api_bp.route("/api/emails/reply", methods=["POST"])
def api_send_email():
    data = request.get_json(silent=True) or {}
    message_id = data.get("message_id", "")
    to_email = data.get("to_email", "")
    subject = data.get("subject", "")
    body = data.get("body", "")
    try:
        success, message = _run_async(
            process_send_email(message_id, to_email, subject, body)
        )
        return jsonify({"success": success, "message": message})
    except Exception as error:
        current_app.logger.exception("Error sending email")
        return jsonify({"success": False, "message": f"Error sending email: {error}"})


@api_bp.route("/api/emails/draft", methods=["POST"])
def api_update_email_draft():
    data = request.get_json(silent=True) or {}
    message_id = data.get("message_id", "")
    draft_reply = data.get("draft_reply", "")
    if not message_id:
        return jsonify({"success": False, "error": "message_id is required"})
    return jsonify(process_update_email_draft(message_id, draft_reply))


@api_bp.route("/api/emails/generate_reply", methods=["POST"])
def api_generate_reply():
    data = request.get_json(silent=True) or {}
    email_content = data.get("email_content", "")
    if not email_content:
        return jsonify({"success": False, "error": "Email content is required"})
    try:
        reply = _run_async(generate_email_reply(email_content))
        return jsonify({"success": True, "reply": reply})
    except Exception as error:
        current_app.logger.exception("Error generating reply")
        return jsonify({"success": False, "error": f"Error generating reply: {error}"})


@api_bp.route("/api/documents/upload", methods=["POST"])
def api_upload_document():
    if "file" not in request.files:
        return jsonify({"success": False, "error": "No file part"})

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"success": False, "error": "No selected file"})
    if not file or not allowed_file(file.filename, ALLOWED_DOCUMENT_EXTENSIONS):
        return jsonify({"success": False, "error": "Invalid file type"})

    filename = secure_filename(file.filename)
    file_path = os.path.join(current_app.config["UPLOAD_FOLDER"], filename)
    file.save(file_path)

    session["document_name"] = filename
    session["document_path"] = file_path
    _document_session_id()
    return jsonify({"success": True, "filename": filename})


@api_bp.route("/api/documents/summarize", methods=["POST"])
def api_summarize_document():
    file_path = session.get("document_path")
    if not file_path or not os.path.exists(file_path):
        return jsonify(
            {"success": False, "error": "No document uploaded or file not found"}
        )

    try:
        result = _run_async(process_document_summary(_document_session_id(), file_path))
        return jsonify(result)
    except ValueError as error:
        return jsonify({"success": False, "error": str(error)})
    except Exception as error:
        current_app.logger.exception("Error during document summarization")
        return jsonify({"success": False, "error": f"Summarization failed: {error}"})


@api_bp.route("/api/documents/chat", methods=["POST"])
def api_chat_document():
    data = request.get_json(silent=True) or {}
    question = data.get("question", "").strip()
    if not question:
        return jsonify({"success": False, "error": "Question is required"})

    try:
        result = _run_async(process_document_chat(_document_session_id(), question))
        return jsonify(result)
    except Exception as error:
        current_app.logger.exception("Error in chat processing")
        return jsonify({"success": False, "error": str(error)})


@api_bp.route("/api/objects/upload", methods=["POST"])
def api_upload_image():
    if "file" not in request.files:
        return jsonify({"success": False, "error": "No file part"})

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"success": False, "error": "No selected file"})
    if not file or not allowed_file(file.filename, ALLOWED_IMAGE_EXTENSIONS):
        return jsonify({"success": False, "error": "Invalid file type"})

    filename = secure_filename(file.filename)
    file_path = os.path.join(current_app.config["UPLOAD_FOLDER"], filename)
    file.save(file_path)
    return jsonify({"success": True, "filename": filename, "path": file_path})


@api_bp.route("/api/objects/detect", methods=["POST"])
def api_detect_objects():
    data = request.get_json(silent=True) or {}
    image_path = os.path.join(current_app.config["UPLOAD_FOLDER"], data.get("filename", ""))
    try:
        result = _run_async(process_object_detection(image_path))
        return jsonify(result)
    except Exception as error:
        current_app.logger.exception("Error detecting objects")
        return jsonify({"success": False, "error": f"Error detecting objects: {error}"})


@api_bp.route("/api/leave/signup", methods=["POST"])
def api_leave_signup():
    data = request.get_json(silent=True) or {}
    title = data.get("title", "")
    name = data.get("name", "")
    email = data.get("email", "")
    password = data.get("password", "")
    if not title or not name or not email or not password:
        return jsonify({"success": False, "error": "All fields are required"})

    return jsonify(process_leave_signup(title, name, email, password))


@api_bp.route("/api/leave/login", methods=["POST"])
def api_leave_login():
    data = request.get_json(silent=True) or {}
    email = data.get("email", "")
    password = data.get("password", "")
    if not email or not password:
        return jsonify({"success": False, "error": "Email and password are required"})

    return jsonify(process_leave_login(email, password))


@api_bp.route("/api/leave/check", methods=["POST"])
def api_leave_check():
    data = request.get_json(silent=True) or {}
    employee_name = data.get("employeeName", "")
    month = data.get("month", "")
    if not employee_name or not month:
        return jsonify(
            {"success": False, "error": "Employee name and month are required"}
        )

    return jsonify(process_leave_check(employee_name, month))


@api_bp.route("/uploads/<filename>")
def uploaded_file(filename):
    return send_from_directory(current_app.config["UPLOAD_FOLDER"], filename)
