import asyncio

from flask import (
    Blueprint,
    Response,
    current_app,
    jsonify,
    request,
    stream_with_context,
)

from llm.email_reply_api import generate_email_reply
from services.agent_services import (
    process_fetch_emails,
    process_list_email_summaries,
    process_send_email,
    process_update_email_draft,
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
