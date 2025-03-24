#!/usr/bin/env python
import sys
import logging
import time

from PyQt5.QtWidgets import QApplication
from PyQt5.QtCore import QThread, pyqtSignal

from gui.main_window import MainWindow
from email_utils.gmail_api import get_gmail_service, fetch_emails
from email_utils.email_parser import parse_email_content
from llm.gemini_api import generate_summary as generate_email_summary
from utils.config import settings
from utils.logger import setup_logger

logger = setup_logger()


class EmailWorker(QThread):
    """
    Worker thread for fetching and summarizing emails.
    Emits signals for summary, status, and progress.
    """
    summary_ready = pyqtSignal(str)
    status_update = pyqtSignal(str)
    progress_update = pyqtSignal(int, int)

    def __init__(self, parent=None):
        super(EmailWorker, self).__init__(parent)
        self.is_running = True

    def run(self):
        self.status_update.emit("Fetching emails…")
        try:
            service = get_gmail_service()
            if not service:
                self.status_update.emit("Error: Could not connect to Gmail API")
                return

            emails = fetch_emails(service, max_results=settings.max_emails_to_fetch)
            if not emails:
                self.status_update.emit("No unread emails found today.")
                return

            total_emails = len(emails)
            self.status_update.emit(
                f"Found {total_emails} unread emails today. Starting summarization…"
            )
            for i, email_data in enumerate(emails):
                if not self.is_running:
                    break
                current = i + 1
                self.progress_update.emit(current, total_emails)
                self.status_update.emit(
                    f"Processing email {current} of {total_emails}…"
                )
                parsed_email = parse_email_content(email_data)
                if not parsed_email:
                    logger.warning(f"Skipping email {current} due to parsing error")
                    continue

                try:
                    logger.info(
                        f"Processing email {current}: Subject: {parsed_email['subject'][:30]}…"
                    )
                except UnicodeEncodeError:
                    logger.warning(
                        f"Skipping logging subject for email {current} due to encoding error."
                    )

                email_content = (
                    f"Subject: {parsed_email['subject']}\n"
                    f"From: {parsed_email['sender']}\n"
                    f"Body: {parsed_email['body']}"
                )
                summary = generate_email_summary(email_content)
                if summary:
                    formatted_summary = (
                        f"From: {parsed_email['sender']}\n"
                        f"Subject: {parsed_email['subject']}\n\n"
                        f"Summary: {summary}"
                    )
                    self.summary_ready.emit(formatted_summary)
                    logger.info(f"Generated summary for email {current}")
                else:
                    logger.warning(
                        f"Failed to generate summary for email {current}"
                    )
                time.sleep(1)  # Delay to avoid rate limiting
            self.status_update.emit("Done!")
        except Exception as e:
            logger.exception("An error occurred during email processing.")
            self.status_update.emit(f"Error: {str(e)}")
        finally:
            self.finished.emit()
            self.stop()

    def stop(self):
        self.is_running = False
        self.status_update.emit("Cancelled.")
        self.quit()
        self.wait()


def main():
    if not settings.gemini_api_key and not settings.mistral_api_key:
        logger.error(
            "Neither GEMINI_API_KEY nor MISTRAL_API_KEY set in environment variables."
        )
        print(
            "Error: Neither GEMINI_API_KEY nor MISTRAL_API_KEY set in environment variables."
        )
        sys.exit(1)

    app = QApplication(sys.argv)
    window = MainWindow()

    # Connect the fetchRequested signal to the new manual_fetch_emails method.
    window.bridge.fetchRequested.connect(window.manual_fetch_emails)

    email_worker = EmailWorker()
    window.fetch_emails_signal.connect(email_worker.start)
    email_worker.summary_ready.connect(window.add_email_summary)
    email_worker.status_update.connect(window.set_status)
    if hasattr(window, "update_progress"):
        email_worker.progress_update.connect(window.update_progress)

    window.show()
    exit_code = app.exec_()
    email_worker.stop()
    email_worker.wait()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
