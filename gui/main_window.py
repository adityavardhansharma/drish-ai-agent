import os
import json
from PyQt5.QtWidgets import QMainWindow, QWidget, QVBoxLayout
from PyQt5.QtCore import QUrl, pyqtSlot, pyqtSignal, QObject
from PyQt5.QtWebEngineWidgets import QWebEngineView
from PyQt5.QtWebChannel import QWebChannel
import logging

logger = logging.getLogger(__name__)


class Bridge(QObject):
    """
    Exposed to JavaScript via QWebChannel.
    Contains methods to trigger email fetching and agent selection.
    """
    fetchRequested = pyqtSignal()
    agentSelectedSignal = pyqtSignal(str)

    @pyqtSlot()
    def fetchEmails(self):
        self.fetchRequested.emit()

    @pyqtSlot(str)
    def agentSelected(self, agent):
        self.agentSelectedSignal.emit(agent)


class MainWindow(QMainWindow):
    fetch_emails_signal = pyqtSignal()

    def __init__(self):
        super(MainWindow, self).__init__()
        self.setWindowTitle("AI Agent Pro")
        self.setGeometry(100, 100, 1200, 800)

        self.web_view = QWebEngineView()
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        # Load the landing page (index.html)
        landing_page_path = os.path.join(base_dir, "templates", "index.html")
        self.web_view.load(QUrl.fromLocalFile(landing_page_path))

        central_widget = QWidget()
        layout = QVBoxLayout(central_widget)
        layout.addWidget(self.web_view)
        self.setCentralWidget(central_widget)

        self.channel = QWebChannel(self.web_view.page())
        self.bridge = Bridge()
        self.channel.registerObject("bridge", self.bridge)
        self.web_view.page().setWebChannel(self.channel)

        self.bridge.fetchRequested.connect(self.emit_fetch_emails)
        self.bridge.agentSelectedSignal.connect(self.load_agent_ui)

    @pyqtSlot()
    def emit_fetch_emails(self):
        self.web_view.page().runJavaScript("clearEmailsList();")
        self.set_status("Fetching emails…")
        self.fetch_emails_signal.emit()

    @pyqtSlot(str)
    def add_email_summary(self, summary):
        try:
            js_code = "window.addEmailSummary({});".format(json.dumps(summary))
            self.web_view.page().runJavaScript(js_code)
            logger.info("Updated HTML with new email summary.")
        except Exception as e:
            logger.error("Error in add_email_summary: " + str(e))

    @pyqtSlot(str)
    def set_status(self, message):
        try:
            js_code = "window.updateStatus({});".format(json.dumps(message))
            self.web_view.page().runJavaScript(js_code)
            logger.info("Updated UI status: " + message)
        except Exception as e:
            logger.error("Error in set_status: " + str(e))

    @pyqtSlot(int, int)
    def update_progress(self, current, total):
        try:
            js_code = "window.updateProgress({}, {});".format(
                json.dumps(current), json.dumps(total)
            )
            self.web_view.page().runJavaScript(js_code)
            logger.info("Updated UI progress: " + str(current) + "/" + str(total))
        except Exception as e:
            logger.error("Error in update_progress: " + str(e))

    @pyqtSlot(str)
    def load_agent_ui(self, agent):
        """Loads the UI for the selected agent based on the agent value."""
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
