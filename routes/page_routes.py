from flask import Blueprint, render_template, session

page_bp = Blueprint("pages", __name__)


@page_bp.route("/")
def index():
    return render_template("index.html")


@page_bp.route("/email")
def email_agent():
    return render_template("email_summarizer.html")


@page_bp.route("/document")
def document_agent():
    chat_context = {
        "document_name": session.get("document_name", "No document loaded"),
        "has_summary": bool(session.get("document_path")),
    }
    return render_template("document_summary.html", **chat_context)


@page_bp.route("/object")
def object_agent():
    return render_template("object_detection.html")


@page_bp.route("/leave")
def leave_agent():
    return render_template("leave_checker.html")
