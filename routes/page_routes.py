from flask import Blueprint, render_template

page_bp = Blueprint("pages", __name__)


@page_bp.route("/")
def index():
    return render_template("email_summarizer.html")


@page_bp.route("/email")
def email_agent():
    return render_template("email_summarizer.html")
