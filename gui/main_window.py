# gui/main_window.py
import os
import json
import PyPDF2
import docx
import logging
import asyncio

from PyQt5.QtWidgets import QMainWindow, QWidget, QVBoxLayout, QFileDialog
from PyQt5.QtCore import QUrl, pyqtSlot, pyqtSignal, QObject, QThread
from PyQt5.QtWebEngineWidgets import QWebEngineView
from PyQt5.QtWebChannel import QWebChannel

logger = logging.getLogger(__name__)


class Bridge(QObject):
    """
    Exposed to JavaScript via QWebChannel.
    Contains methods for triggering email, document, and object actions.
    """
    fetchRequested = pyqtSignal()
    agentSelectedSignal = pyqtSignal(str)
    documentSummaryRequested = pyqtSignal()
    documentQuestionAsked = pyqtSignal(str)
    objectImageSelectionRequested = pyqtSignal()
    objectDetectionRequested = pyqtSignal()

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

    # New slots for Object Detection
    @pyqtSlot()
    def selectImageFile(self):
        logger.info("selectImageFile called from JavaScript")
        self.objectImageSelectionRequested.emit()

    @pyqtSlot()
    def detectObjects(self):
        logger.info("detectObjects called from JavaScript")
        self.objectDetectionRequested.emit()


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

            # Emit the document content for later use in chat
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
        """Extract text from PDF, DOCX, or plain text files."""
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
    answer_ready = pyqtSignal(str, str)  # answer, error

    def __init__(self, question, document_content, conversation_history=None):
        super().__init__()
        self.question = question
        self.document_content = document_content
        self.conversation_history = conversation_history or []

    def run(self):
        try:
            from llm.chat_api import chat_with_document, ChatMessage

            # Convert conversation history to ChatMessage objects if they're not already
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
    """Worker thread for handling object detection using Gemini API."""
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

        # Set up the web channel.
        self.channel = QWebChannel(self.web_view.page())
        self.bridge = Bridge()
        self.channel.registerObject("bridge", self.bridge)
        self.web_view.page().setWebChannel(self.channel)

        # First load the landing page (index.html)
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        landing_page = os.path.join(base_dir, "templates", "index.html")
        self.web_view.load(QUrl.fromLocalFile(landing_page))

        central_widget = QWidget()
        layout = QVBoxLayout(central_widget)
        layout.addWidget(self.web_view)
        self.setCentralWidget(central_widget)

        # Store selected file paths for document and object detection.
        self.selected_document_path = None
        self.selected_object_image_path = None

        # Store document content and chat history
        self.document_content = ""
        self.chat_history = []

        # Connect signals.
        self.bridge.fetchRequested.connect(self.emit_fetch_emails)
        self.bridge.agentSelectedSignal.connect(self.load_agent_ui)
        self.bridge.documentSummaryRequested.connect(self.handle_document_request)
        self.bridge.documentQuestionAsked.connect(self.handle_document_question)
        # Connect new object detection signals
        self.bridge.objectImageSelectionRequested.connect(self.open_object_dialog)
        self.bridge.objectDetectionRequested.connect(self.handle_object_detection)

        logger.info("MainWindow initialized with bridge and web channel")

    @pyqtSlot()
    def emit_fetch_emails(self):
        self.web_view.page().runJavaScript(
            "if (typeof clearEmailsList === 'function') { clearEmailsList(); }"
        )
        self.set_status("Fetching emails…")
        self.fetch_emails_signal.emit()

    @pyqtSlot(str)
    def add_email_summary(self, summary):
        try:
            js_code = (
                "if (typeof addEmailSummary === 'function') { addEmailSummary("
                + json.dumps(summary)
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
        """
        Loads the UI for the selected agent.
        If agent == "document", load document_summary.html;
        if "email", load email_summarizer.html;
        if "object", load object_detection.html.
        """
        logger.info(f"Loading agent UI for: {agent}")
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if agent == "email":
            agent_page_path = os.path.join(
                base_dir, "templates", "email_summarizer.html"
            )
        elif agent == "document":
            agent_page_path = os.path.join(
                base_dir, "templates", "document_summary.html"
            )
        elif agent == "object":
            agent_page_path = os.path.join(
                base_dir, "templates", "object_detection.html"
            )
        else:
            agent_page_path = os.path.join(base_dir, "templates", "index.html")
            logger.warning(f"Unknown agent: {agent}. Loading landing page.")
        url = QUrl.fromLocalFile(agent_page_path)
        self.web_view.load(url)
        self.web_view.loadFinished.connect(self.on_page_loaded)

        # Reset document-related and object detection state when switching agents
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
        else:
            logger.error("Page failed to load")

    @pyqtSlot()
    def handle_document_request(self):
        """
        If no document is selected, open the file dialog.
        Otherwise, generate the summary for the selected document.
        """
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
            "Documents (*.pdf *.docx *.doc *.txt)",
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

            # Reset chat history when a new document is selected
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
        """Store the document content for use in chat."""
        logger.info("Storing document content for chat")
        self.document_content = content

    @pyqtSlot(str)
    def display_document_summary(self, summary):
        logger.info("Displaying document summary")
        # Escape backticks to avoid breaking JavaScript
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
        """Handle a question about the document."""
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

        # Create and start the chat worker
        self.chat_worker = ChatWorker(
            question, self.document_content, self.chat_history
        )
        self.chat_worker.answer_ready.connect(self.display_chat_response)
        self.chat_worker.start()

        # Add user message to chat history
        from llm.chat_api import ChatMessage
        self.chat_history.append(ChatMessage(role="user", content=question))

    @pyqtSlot(str, str)
    def display_chat_response(self, answer, error):
        """Display the chat response in the UI."""
        logger.info("Displaying chat response")

        if error:
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

    # New methods for Object Detection
    @pyqtSlot()
    def open_object_dialog(self):
        logger.info("Opening object image file dialog")
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "Select Image",
            "",
            "Images (*.png *.jpg *.jpeg *.bmp)",
        )
        if file_path:
            logger.info(f"Selected image: {file_path}")
            self.selected_object_image_path = file_path
            file_name = os.path.basename(file_path)
            # Convert the local file path to a file URL.
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
        logger.info(
            f"Handling object detection for: {self.selected_object_image_path}"
        )
        self.object_detection_worker = ObjectDetectionWorker(
            self.selected_object_image_path
        )
        self.object_detection_worker.detection_result_ready.connect(
            self.display_detection_result
        )
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
        logger.info("Displaying object detection result")
        escaped_result = result.replace("`", "\\`")
        js_code = (
            "if (typeof displayDetectionResult === 'function') { displayDetectionResult(`"
            + escaped_result
            + "`); }"
        )
        self.web_view.page().runJavaScript(js_code)
