import os
import json
import logging
import asyncio
import time

from PyQt5.QtWidgets import (
    QMainWindow,
    QWidget,
    QVBoxLayout,
    QFileDialog,
)
from PyQt5.QtCore import QUrl, pyqtSlot, pyqtSignal, QObject, QThread, QTimer
from PyQt5.QtWebEngineWidgets import QWebEngineView
from PyQt5.QtWebChannel import QWebChannel

# Import our Gmail and LLM functionality.
from email_utils.gmail_api import get_gmail_service, fetch_emails, send_reply
from email_utils.email_parser import parse_email_content

logger = logging.getLogger(__name__)


class FetchEmailsWorker(QThread):
    """
    Worker thread for fetching emails (runs in the background to avoid UI blocking).
    Emits signals for completion, progress updates, status messages, and processed email summaries.
    """
    completed = pyqtSignal(bool, str)  # (success, error message)
    email_found = pyqtSignal(str)
    progress_update = pyqtSignal(int, int)
    status_update = pyqtSignal(str)

    def __init__(self, is_auto_fetch=False):
        super().__init__()
        self.is_auto_fetch = is_auto_fetch

    def run(self):
        try:
            from email_utils.gmail_api import get_gmail_service, fetch_emails
            from email_utils.email_parser import parse_email_content
            from llm.gemini_api import generate_summary
            from llm.mistral_reply_api import generate_email_reply

            status_prefix = "Auto-fetching" if self.is_auto_fetch else "Fetching"
            self.status_update.emit(f"{status_prefix} emails...")
            service = get_gmail_service()
            if not service:
                self.completed.emit(False, "Failed to authenticate with Gmail.")
                return

            self.status_update.emit(f"{status_prefix} unread emails from today...")
            emails = fetch_emails(service)
            if not emails:
                msg = "No new emails found."
                self.status_update.emit(msg)
                self.completed.emit(True, msg)
                return

            total_emails = len(emails)
            self.status_update.emit(f"Processing {total_emails} emails...")

            for i, email_data in enumerate(emails):
                try:
                    self.progress_update.emit(i + 1, total_emails)
                    parsed_email = parse_email_content(email_data)
                    if not parsed_email:
                        logger.error(f"Failed to parse email {i + 1}/{total_emails}")
                        continue

                    self.status_update.emit(
                        f"Summarizing email {i + 1}/{total_emails}..."
                    )
                    # Generate summary using Gemini API.
                    summary = generate_summary(
                        f"Subject: {parsed_email['subject']}\n"
                        f"From: {parsed_email['sender']}\n"
                        f"Body: {parsed_email['body']}"
                    )
                    # Generate reply using Mistral API.
                    reply = asyncio.run(generate_email_reply(
                        f"Subject: {parsed_email['subject']}\n"
                        f"From: {parsed_email['sender']}\n"
                        f"Body: {parsed_email['body']}"
                    ))
                    formatted_summary = (
                        f"From: {parsed_email['sender']}\n"
                        f"Subject: {parsed_email['subject']}\n"
                        f"Message ID: {parsed_email.get('message_id', 'N/A')}\n\n"
                        f"Summary: {summary}"
                    )
                    # Build a JSON payload containing summary, generated reply, and email metadata.
                    email_payload = {
                        "summary": formatted_summary,
                        "reply": reply,
                        "message_id": parsed_email.get("message_id", ""),
                        "to_email": parsed_email["sender"],
                        "subject": parsed_email["subject"],
                    }
                    self.email_found.emit(json.dumps(email_payload))
                    logger.info(f"Generated summary for message {parsed_email.get('message_id')}")
                except Exception as e:
                    logger.error(f"Error processing email {i + 1}: {str(e)}")
            self.status_update.emit(f"Completed processing {total_emails} emails")
            self.completed.emit(True, "")
        except Exception as e:
            logger.exception(f"Error in fetch emails worker: {str(e)}")
            self.completed.emit(False, f"Error: {str(e)}")


class EmailReplyWorker(QThread):
    """Worker thread for generating an AI reply for a given email content."""
    reply_ready = pyqtSignal(str, str)  # (reply_text, error_message)
    status_update = pyqtSignal(str)

    def __init__(self, email_content):
        super().__init__()
        self.email_content = email_content

    def run(self):
        self.status_update.emit("Generating email reply...")
        try:
            from llm.mistral_reply_api import generate_email_reply
            reply = asyncio.run(generate_email_reply(self.email_content))
            self.reply_ready.emit(reply, "")
            self.status_update.emit("Reply generated.")
        except Exception as e:
            logger.error(f"Error generating email reply: {e}")
            self.reply_ready.emit("", f"Error: {str(e)}")
            self.status_update.emit(f"Error: {str(e)}")


class SendEmailWorker(QThread):
    """Worker thread for sending email replies."""
    email_sent = pyqtSignal(bool, str)  # (success, message)
    status_update = pyqtSignal(str)

    def __init__(self, message_id, to_email, subject, message_body):
        super().__init__()
        self.message_id = message_id
        self.to_email = to_email
        self.subject = subject
        self.message_body = message_body

    def run(self):
        self.status_update.emit("Sending email reply...")
        try:
            service = get_gmail_service()
            if not service:
                self.email_sent.emit(False, "Failed to authenticate with Gmail.")
                self.status_update.emit("Error: Failed to authenticate with Gmail.")
                return

            success, response = send_reply(
                service, self.message_id, self.to_email, self.subject, self.message_body
            )
            if success:
                self.email_sent.emit(True, "Email sent successfully!")
                self.status_update.emit("Email sent successfully!")
            else:
                self.email_sent.emit(False, f"Failed to send email: {response}")
                self.status_update.emit(f"Error: Failed to send email: {response}")
        except Exception as e:
            logger.error(f"Error sending email: {e}")
            self.email_sent.emit(False, f"Error: {str(e)}")
            self.status_update.emit(f"Error: {str(e)}")


class Bridge(QObject):
    """
    Exposed to JavaScript via QWebChannel.
    Contains methods for triggering actions for email, document, and object tasks.
    """
    fetchRequested = pyqtSignal()
    agentSelectedSignal = pyqtSignal(str)
    documentSummaryRequested = pyqtSignal()
    documentQuestionAsked = pyqtSignal(str)
    objectImageSelectionRequested = pyqtSignal()
    objectDetectionRequested = pyqtSignal()
    autoFetchStatusChanged = pyqtSignal(bool)
    generateReplyRequested = pyqtSignal(str, str, str, str)  # (email_content, message_id, to_email, subject)
    sendEmailReply = pyqtSignal(str)  # (reply_text)
    # New signal to set the current email from JS
    setCurrentEmailData = pyqtSignal(str)  # (email_json)

    @pyqtSlot()
    def fetchEmails(self):
        logger.info("fetchEmails called from JavaScript")
        self.fetchRequested.emit()

    @pyqtSlot(str)
    def agentSelected(self, agent):
        logger.info(f"agentSelected called from JavaScript with agent: {agent}")
        self.agentSelectedSignal.emit(agent)

    @pyqtSlot()
    def requestDocumentSummary(self):
        logger.info("requestDocumentSummary called from JavaScript")
        self.documentSummaryRequested.emit()

    @pyqtSlot()
    def generateDocumentSummary(self):
        logger.info("generateDocumentSummary called from JavaScript")
        self.documentSummaryRequested.emit()

    @pyqtSlot(str)
    def askDocumentQuestion(self, question):
        logger.info(f"askDocumentQuestion called from JavaScript with question: {question}")
        self.documentQuestionAsked.emit(question)

    @pyqtSlot()
    def selectImageFile(self):
        logger.info("selectImageFile called from JavaScript")
        self.objectImageSelectionRequested.emit()

    @pyqtSlot()
    def detectObjects(self):
        logger.info("detectObjects called from JavaScript")
        self.objectDetectionRequested.emit()

    @pyqtSlot(bool)
    def setAutoFetchStatus(self, enabled):
        logger.info(f"setAutoFetchStatus called from JavaScript with status: {enabled}")
        self.autoFetchStatusChanged.emit(enabled)

    @pyqtSlot(str, str, str, str)
    def generateReply(self, email_content, message_id, to_email, subject):
        logger.info(f"generateReply called from JavaScript for email subject: {subject}")
        self.generateReplyRequested.emit(email_content, message_id, to_email, subject)

    @pyqtSlot(str)
    def sendReply(self, reply_text):
        logger.info("sendReply called from JavaScript")
        self.sendEmailReply.emit(reply_text)

    # NEW: Receive currently selected email data from JavaScript.
    @pyqtSlot(str)
    def setCurrentEmail(self, email_json):
        logger.info(f"setCurrentEmail called with data: {email_json}")
        self.setCurrentEmailData.emit(email_json)


class SummaryWorker(QThread):
    """Worker thread for generating document summaries."""
    summary_ready = pyqtSignal(str)
    status_update = pyqtSignal(str)
    document_content_ready = pyqtSignal(str)

    def __init__(self, file_path):
        super().__init__()
        self.file_path = file_path

    def run(self):
        self.status_update.emit("Extracting text from document…")
        try:
            document_content = self.extract_text_from_file(self.file_path)
            if not document_content:
                self.status_update.emit("Error: Could not extract text from document.")
                return

            self.document_content_ready.emit(document_content)
            self.status_update.emit("Generating summary…")
            from llm.mistral_api import generate_summary
            summary = asyncio.run(generate_summary(document_content))
            self.summary_ready.emit(summary)
            self.status_update.emit("Summary complete.")
        except Exception as e:
            self.status_update.emit(f"Error: {str(e)}")
            logger.error(f"Error during document summarization: {e}")

    def extract_text_from_file(self, file_path):
        import os
        _, file_extension = os.path.splitext(file_path)
        if file_extension.lower() == '.pdf':
            return self.extract_text_from_pdf(file_path)
        elif file_extension.lower() in ['.docx', '.doc']:
            return self.extract_text_from_docx(file_path)
        else:
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    return f.read()
            except Exception as e:
                logger.error(f"Error reading file as text: {e}")
                return None

    def extract_text_from_pdf(self, pdf_path):
        import PyPDF2
        try:
            text = ""
            with open(pdf_path, 'rb') as f:
                pdf_reader = PyPDF2.PdfReader(f)
                for page in pdf_reader.pages:
                    text += page.extract_text() + "\n"
            return text
        except Exception as e:
            logger.error(f"Error extracting text from PDF: {e}")
            return None

    def extract_text_from_docx(self, docx_path):
        import docx
        try:
            doc = docx.Document(docx_path)
            text = ""
            for para in doc.paragraphs:
                text += para.text + "\n"
            return text
        except Exception as e:
            logger.error(f"Error extracting text from DOCX: {e}")
            return None


class ChatWorker(QThread):
    """Worker thread for handling document chat questions."""
    answer_ready = pyqtSignal(str, str)  # (answer, error)

    def __init__(self, question, document_content, conversation_history=None):
        super().__init__()
        self.question = question
        self.document_content = document_content
        self.conversation_history = conversation_history or []

    def run(self):
        try:
            from llm.chat_api import chat_with_document, ChatMessage
            chat_history = []
            for msg in self.conversation_history:
                if isinstance(msg, dict):
                    chat_history.append(ChatMessage(**msg))
                elif isinstance(msg, ChatMessage):
                    chat_history.append(msg)
            response = asyncio.run(
                chat_with_document(self.question, self.document_content, chat_history)
            )
            if response.error:
                self.answer_ready.emit("", response.error)
            else:
                self.answer_ready.emit(response.answer, "")
        except Exception as e:
            logger.error(f"Error during chat: {e}")
            self.answer_ready.emit("", f"Error: {str(e)}")


class ObjectDetectionWorker(QThread):
    """Worker thread for handling object detection using Gemini (if available)."""
    detection_result_ready = pyqtSignal(str)
    status_update = pyqtSignal(str)

    def __init__(self, image_path):
        super().__init__()
        self.image_path = image_path

    def run(self):
        self.status_update.emit("Analyzing image for object detection…")
        try:
            from llm.gemini_object_detection import detect_objects
            result = asyncio.run(detect_objects(self.image_path))
            self.detection_result_ready.emit(result)
            self.status_update.emit("Object detection completed.")
        except Exception as e:
            self.status_update.emit(f"Error: {str(e)}")
            logger.error(f"Error during object detection: {e}")


class MainWindow(QMainWindow):
    fetch_emails_signal = pyqtSignal()

    def __init__(self):
        super(MainWindow, self).__init__()
        self.setWindowTitle("AI Agent Pro")
        self.setGeometry(100, 100, 1200, 800)

        self.web_view = QWebEngineView()
        self.channel = QWebChannel(self.web_view.page())
        self.bridge = Bridge()
        self.channel.registerObject("bridge", self.bridge)
        self.web_view.page().setWebChannel(self.channel)

        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        landing_page = os.path.join(base_dir, "templates", "index.html")
        self.web_view.load(QUrl.fromLocalFile(landing_page))

        central_widget = QWidget()
        layout = QVBoxLayout(central_widget)
        layout.addWidget(self.web_view)
        self.setCentralWidget(central_widget)

        # State variables
        self.selected_document_path = None
        self.selected_object_image_path = None
        self.document_content = ""
        self.chat_history = []
        # current_email_data stores data for the selected email for reply.
        # Initially, it is empty.
        self.current_email_data = {}

        # Setup auto-fetch timer (15 minutes = 900,000 milliseconds)
        self.auto_fetch_timer = QTimer(self)
        self.auto_fetch_timer.setInterval(900000)
        self.auto_fetch_timer.timeout.connect(self.auto_fetch_emails)
        self.auto_fetch_enabled = False

        # Flag to prevent concurrent fetch operations
        self.fetch_in_progress = False

        # Connect signals from the Bridge to MainWindow actions.
        self.bridge.fetchRequested.connect(self.manual_fetch_emails)
        self.bridge.agentSelectedSignal.connect(self.load_agent_ui)
        self.bridge.documentSummaryRequested.connect(self.handle_document_request)
        self.bridge.documentQuestionAsked.connect(self.handle_document_question)
        self.bridge.objectImageSelectionRequested.connect(self.open_object_dialog)
        self.bridge.objectDetectionRequested.connect(self.handle_object_detection)
        self.bridge.autoFetchStatusChanged.connect(self.toggle_auto_fetch)
        self.bridge.generateReplyRequested.connect(self.generate_email_reply)
        self.bridge.sendEmailReply.connect(self.send_email_reply)
        # NEW: Connect the setCurrentEmailData signal to update current_email_data.
        self.bridge.setCurrentEmailData.connect(self.update_current_email)

        logger.info("MainWindow initialized with bridge and web channel")

    @pyqtSlot(str)
    def update_current_email(self, email_json):
        """Update the current email data based on the selection from the JS UI."""
        try:
            self.current_email_data = json.loads(email_json)
            logger.info(f"Current email updated: {self.current_email_data}")
        except Exception as e:
            logger.error(f"Error updating current email data: {e}")

    @pyqtSlot(bool)
    def toggle_auto_fetch(self, enabled):
        """Toggle auto-fetch functionality."""
        self.auto_fetch_enabled = enabled
        if enabled and not self.auto_fetch_timer.isActive():
            logger.info("Auto-fetch enabled, starting timer")
            self.auto_fetch_timer.start()
            self.update_auto_fetch_status(True)
        elif not enabled and self.auto_fetch_timer.isActive():
            logger.info("Auto-fetch disabled, stopping timer")
            self.auto_fetch_timer.stop()
            self.update_auto_fetch_status(False)

    def update_auto_fetch_status(self, enabled):
        """Update the UI to reflect auto-fetch status."""
        js_code = (
                "if (typeof updateAutoFetchStatus === 'function') { updateAutoFetchStatus("
                + json.dumps(enabled)
                + "); }"
        )
        self.web_view.page().runJavaScript(js_code)

    @pyqtSlot()
    def auto_fetch_emails(self):
        """Automatically fetch emails on timer."""
        if self.auto_fetch_enabled and not self.fetch_in_progress:
            logger.info("Auto-fetch timer triggered, fetching emails")
            self.fetch_emails(is_auto_fetch=True)
        elif self.fetch_in_progress:
            logger.info("Skipping auto-fetch as a fetch operation is already in progress")

    @pyqtSlot()
    def manual_fetch_emails(self):
        """Handle manual fetch initiated by user clicking the button."""
        if not self.fetch_in_progress:
            if not self.auto_fetch_timer.isActive():
                self.auto_fetch_enabled = True
                self.auto_fetch_timer.start()
                logger.info("Started auto-fetch timer after manual fetch")
                self.update_auto_fetch_status(True)
            self.fetch_emails(is_auto_fetch=False)
        else:
            logger.info("Ignoring fetch request as a fetch operation is already in progress")

    def fetch_emails(self, is_auto_fetch=False):
        """Common method for both manual and auto fetching of emails."""
        if self.fetch_in_progress:
            logger.info("Fetch already in progress, ignoring request")
            return

        self.fetch_in_progress = True

        if not is_auto_fetch:
            self.web_view.page().runJavaScript(
                "if (typeof clearEmailsList === 'function') { clearEmailsList(); }"
            )

        status_msg = "Auto-fetching emails…" if is_auto_fetch else "Fetching emails…"
        self.set_status(status_msg)

        self.fetch_worker = FetchEmailsWorker(is_auto_fetch)
        self.fetch_worker.completed.connect(self.on_fetch_completed)
        self.fetch_worker.email_found.connect(self.add_email_summary)
        self.fetch_worker.progress_update.connect(self.update_progress)
        self.fetch_worker.status_update.connect(self.set_status)
        self.fetch_worker.start()

    @pyqtSlot(bool, str)
    def on_fetch_completed(self, success, error_msg):
        """Handle completion of email fetching."""
        self.fetch_in_progress = False
        if not success:
            self.set_status(f"Error: {error_msg}")
            logger.error(f"Email fetch failed: {error_msg}")
        else:
            self.set_status("Ready" if not error_msg else error_msg)
            logger.info("Email fetch completed successfully")
        self.web_view.page().runJavaScript(
            "if (typeof hideLoadingState === 'function') { hideLoadingState(); }"
        )

    @pyqtSlot(str)
    def add_email_summary(self, email_json):
        """
        Expects a JSON string with keys: summary, reply, message_id, to_email, subject.
        This JSON is passed from the EmailWorker.
        """
        try:
            email_data = json.loads(email_json)
            summary = email_data.get("summary", "")
            reply = email_data.get("reply", "")
            message_id = email_data.get("message_id", "")
            to_email = email_data.get("to_email", "")
            subject = email_data.get("subject", "")
            js_code = (
                    "if (typeof addEmailSummary === 'function') { addEmailSummary("
                    + json.dumps(summary)
                    + ", "
                    + json.dumps(reply)
                    + ", "
                    + json.dumps(message_id)
                    + ", "
                    + json.dumps(to_email)
                    + ", "
                    + json.dumps(subject)
                    + "); }"
            )
            self.web_view.page().runJavaScript(js_code)
            logger.info("Updated HTML with new email summary.")
        except Exception as e:
            logger.error("Error in add_email_summary: " + str(e))

    @pyqtSlot(str)
    def set_status(self, message):
        try:
            js_code = (
                    "if (typeof updateStatus === 'function') { updateStatus("
                    + json.dumps(message)
                    + "); }"
            )
            self.web_view.page().runJavaScript(js_code)
            logger.info("Updated UI status: " + message)
        except Exception as e:
            logger.error("Error in set_status: " + str(e))

    @pyqtSlot(int, int)
    def update_progress(self, current, total):
        try:
            js_code = (
                    "if (typeof updateProgress === 'function') { updateProgress("
                    + json.dumps(current)
                    + ", "
                    + json.dumps(total)
                    + "); }"
            )
            self.web_view.page().runJavaScript(js_code)
            logger.info("Updated UI progress: " + str(current) + "/" + str(total))
        except Exception as e:
            logger.error("Error in update_progress: " + str(e))

    @pyqtSlot(str)
    def load_agent_ui(self, agent):
        logger.info(f"Loading agent UI for: {agent}")
        if agent != "email" and self.auto_fetch_timer.isActive():
            logger.info("Stopping auto-fetch timer when leaving email agent")
            self.auto_fetch_timer.stop()
            self.auto_fetch_enabled = False

        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if agent == "email":
            agent_page_path = os.path.join(base_dir, "templates", "email_summarizer.html")
        elif agent == "document":
            agent_page_path = os.path.join(base_dir, "templates", "document_summary.html")
        elif agent == "object":
            agent_page_path = os.path.join(base_dir, "templates", "object_detection.html")
        else:
            agent_page_path = os.path.join(base_dir, "templates", "index.html")
            logger.warning(f"Unknown agent: {agent}. Loading landing page.")
        url = QUrl.fromLocalFile(agent_page_path)
        self.web_view.load(url)
        self.web_view.loadFinished.connect(self.on_page_loaded)

        if agent != "document":
            self.selected_document_path = None
            self.document_content = ""
            self.chat_history = []
        if agent != "object":
            self.selected_object_image_path = None

    def on_page_loaded(self, success):
        if success:
            logger.info("Page loaded successfully, re-establishing web channel")
            self.web_view.page().setWebChannel(self.channel)
            page_title = self.web_view.page().title()
            if "Email" in page_title and self.auto_fetch_enabled:
                self.update_auto_fetch_status(True)
        else:
            logger.error("Page failed to load")

    @pyqtSlot()
    def handle_document_request(self):
        if not self.selected_document_path:
            self.open_document_dialog()
        else:
            self.handle_document_summary_request(self.selected_document_path)

    @pyqtSlot()
    def open_document_dialog(self):
        logger.info("Opening document file dialog")
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "Select Document",
            "",
            "Documents (*.pdf *.docx *.doc *.txt)"
        )
        if file_path:
            logger.info(f"Selected document: {file_path}")
            self.selected_document_path = file_path
            file_name = os.path.basename(file_path)
            js_code = (
                    "if (typeof setFileName === 'function') { setFileName("
                    + json.dumps(file_name)
                    + "); }"
            )
            self.web_view.page().runJavaScript(js_code)
            self.chat_history = []

    @pyqtSlot(str)
    def handle_document_summary_request(self, file_path):
        logger.info(f"Handling document summary request for: {file_path}")
        self.summary_worker = SummaryWorker(file_path)
        self.summary_worker.summary_ready.connect(self.display_document_summary)
        self.summary_worker.status_update.connect(self.update_document_status)
        self.summary_worker.document_content_ready.connect(self.store_document_content)
        self.summary_worker.start()

    @pyqtSlot(str)
    def store_document_content(self, content):
        logger.info("Storing document content for chat")
        self.document_content = content

    @pyqtSlot(str)
    def display_document_summary(self, summary):
        logger.info("Displaying document summary")
        escaped_summary = summary.replace("`", "\\`")
        js_code = (
                "if (typeof displayDocumentSummary === 'function') { displayDocumentSummary(`"
                + escaped_summary
                + "`); }"
        )
        self.web_view.page().runJavaScript(js_code)

    @pyqtSlot(str)
    def update_document_status(self, status):
        logger.info(f"Updating document status: {status}")
        status_type = "loading"
        if "Generating" in status or "Extracting" in status:
            status_type = "loading"
        elif "complete" in status:
            status_type = "success"
        elif "Error" in status:
            status_type = "error"
        js_code = (
                "if (typeof updateStatus === 'function') { updateStatus("
                + json.dumps(status)
                + ", "
                + json.dumps(status_type)
                + "); }"
        )
        self.web_view.page().runJavaScript(js_code)

    @pyqtSlot(str)
    def handle_document_question(self, question):
        logger.info(f"Handling document question: {question}")
        if not self.document_content:
            logger.error("No document content available for chat")
            js_code = (
                    "if (typeof displayChatResponse === 'function') { displayChatResponse('', "
                    + json.dumps("No document content available. Please generate a summary first.")
                    + "); }"
            )
            self.web_view.page().runJavaScript(js_code)
            return
        self.chat_worker = ChatWorker(
            question, self.document_content, self.chat_history
        )
        self.chat_worker.answer_ready.connect(self.display_chat_response)
        self.chat_worker.start()
        from llm.chat_api import ChatMessage
        self.chat_history.append(ChatMessage(role="user", content=question))

    @pyqtSlot(str, str)
    def display_chat_response(self, answer, error):
        logger.info("Displaying chat response")
        if (error):
            js_code = (
                    "if (typeof displayChatResponse === 'function') { displayChatResponse('', "
                    + json.dumps(error)
                    + "); }"
            )
        else:
            from llm.chat_api import ChatMessage
            self.chat_history.append(ChatMessage(role="assistant", content=answer))
            escaped_answer = answer.replace("`", "\\`")
            js_code = (
                    "if (typeof displayChatResponse === 'function') { displayChatResponse(`"
                    + escaped_answer
                    + "`, ''); }"
            )
        self.web_view.page().runJavaScript(js_code)

    @pyqtSlot()
    def open_object_dialog(self):
        logger.info("Opening object image file dialog")
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "Select Image",
            "",
            "Images (*.png *.jpg *.jpeg *.bmp)"
        )
        if file_path:
            logger.info(f"Selected image: {file_path}")
            self.selected_object_image_path = file_path
            file_name = os.path.basename(file_path)
            file_url = QUrl.fromLocalFile(file_path).toString()
            js_code = (
                    "if (typeof setImageName === 'function') { setImageName("
                    + json.dumps(file_name)
                    + ", "
                    + json.dumps(file_url)
                    + "); }"
            )
            self.web_view.page().runJavaScript(js_code)

    @pyqtSlot()
    def handle_object_detection(self):
        if not self.selected_object_image_path:
            logger.error("No image selected for object detection")
            js_code = (
                    "if (typeof displayDetectionResult === 'function') { displayDetectionResult('', "
                    + json.dumps("No image selected. Please select an image first.")
                    + "); }"
            )
            self.web_view.page().runJavaScript(js_code)
            return
        logger.info(f"Handling object detection for: {self.selected_object_image_path}")
        self.object_detection_worker = ObjectDetectionWorker(self.selected_object_image_path)
        self.object_detection_worker.detection_result_ready.connect(self.display_detection_result)
        self.object_detection_worker.status_update.connect(self.update_object_status)
        self.object_detection_worker.start()

    @pyqtSlot(str)
    def update_object_status(self, status):
        logger.info(f"Updating object detection status: {status}")
        status_type = "loading"
        if "Analyzing" in status:
            status_type = "loading"
        elif "completed" in status:
            status_type = "success"
        elif "Error" in status:
            status_type = "error"
        js_code = (
                "if (typeof updateStatus === 'function') { updateStatus("
                + json.dumps(status)
                + ", "
                + json.dumps(status_type)
                + "); }"
        )
        self.web_view.page().runJavaScript(js_code)

    @pyqtSlot(str)
    def display_detection_result(self, result):
        """Display the object detection result in the web UI."""
        js_code = (
                "if (typeof displayDetectionResult === 'function') { displayDetectionResult("
                + json.dumps(result)
                + "); }"
        )
        self.web_view.page().runJavaScript(js_code)

    # === New Email Reply Methods ===
    def generate_email_reply(self, email_content, message_id, to_email, subject):
        """Generate an AI reply for the selected email."""
        # If no current email is set, use passed parameters.
        if not self.current_email_data:
            self.current_email_data = {
                "message_id": message_id,
                "to_email": to_email,
                "subject": subject,
                "content": email_content,
            }
        self.reply_worker = EmailReplyWorker(email_content)
        self.reply_worker.reply_ready.connect(self.on_reply_generated)
        self.reply_worker.status_update.connect(self.set_status)
        self.reply_worker.start()

    @pyqtSlot(str, str)
    def on_reply_generated(self, reply_text, error):
        """Handle the generated email reply."""
        if error:
            js_code = (
                    "if (typeof displayReplyError === 'function') { displayReplyError("
                    + json.dumps(error)
                    + "); }"
            )
        else:
            js_code = (
                    "if (typeof displayGeneratedReply === 'function') { displayGeneratedReply("
                    + json.dumps(reply_text)
                    + "); }"
            )
        self.web_view.page().runJavaScript(js_code)

    @pyqtSlot(str)
    def send_email_reply(self, reply_text):
        """Send the email reply using Gmail API."""
        if not self.current_email_data:
            self.set_status("Error: No email selected for reply.")
            return
        self.send_worker = SendEmailWorker(
            self.current_email_data["message_id"],
            self.current_email_data["to_email"],
            self.current_email_data["subject"],
            reply_text,
        )
        self.send_worker.email_sent.connect(self.on_email_sent)
        self.send_worker.status_update.connect(self.set_status)
        self.send_worker.start()

    @pyqtSlot(bool, str)
    def on_email_sent(self, success, message):
        """Handle the result of sending the email."""
        js_code = (
                "if (typeof updateReplyStatus === 'function') { updateReplyStatus("
                + json.dumps(success)
                + ", "
                + json.dumps(message)
                + "); }"
        )
        self.web_view.page().runJavaScript(js_code)
