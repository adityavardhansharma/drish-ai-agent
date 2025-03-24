import os
import logging
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from datetime import date, timedelta

logger = logging.getLogger(__name__)

# Gmail read-only scope, plus modify scope to mark emails as read.
SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
]

# Determine paths for credentials and token.
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CREDS_PATH = os.path.join(BASE_DIR, "secrets", "credentials.json")
TOKEN_PATH = os.path.join(BASE_DIR, "secrets", "token.json")


def get_gmail_service():
    """Authenticates and returns a Gmail API service instance."""
    creds = None
    if os.path.exists(TOKEN_PATH):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)
        except Exception as e:
            logger.error(f"Error loading credentials from token file: {e}")

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception as e:
                logger.error(f"Error refreshing credentials: {e}")
                creds = None
        if not creds:
            if not os.path.exists(CREDS_PATH):
                logger.error(f"Credentials file not found at {CREDS_PATH}")
                return None
            try:
                flow = InstalledAppFlow.from_client_secrets_file(CREDS_PATH, SCOPES)
                creds = flow.run_local_server(port=0)
            except Exception as e:
                logger.error(f"Error during authentication flow: {e}")
                return None

        try:
            os.makedirs(os.path.dirname(TOKEN_PATH), exist_ok=True)
            with open(TOKEN_PATH, "w") as token:
                token.write(creds.to_json())
        except Exception as e:
            logger.error(f"Error saving token: {e}")

    try:
        service = build("gmail", "v1", credentials=creds)
        return service
    except HttpError as error:
        logger.error(f"An error occurred building the Gmail service: {error}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error building the Gmail service: {e}")
        return None

def fetch_emails(service, max_results=10):
    """Fetches a list of unread emails from the Gmail API for today's date, and marks them as read."""
    try:
        # Get today's date in "YYYY/MM/DD" format
        today = date.today()
        today_str = today.strftime("%Y/%m/%d")
        tomorrow = today + timedelta(days=1)
        tomorrow_str = tomorrow.strftime("%Y/%m/%d")

        # Construct the query to fetch only unread emails from today
        query = f"is:unread after:{today_str} before:{tomorrow_str}"

        # Make the API call to list messages
        results = service.users().messages().list(
            userId="me", q=query, maxResults=max_results, labelIds=["INBOX"]
        ).execute()
        messages = results.get("messages", [])

        if not messages:
            logger.info("No unread messages found for today.")
            return []

        logger.info(f"Found {len(messages)} unread messages for today, fetching content and marking as read...")
        email_contents = []

        # Fetch content for each message and mark as read
        for message in messages:
            try:
                msg = service.users().messages().get(
                    userId="me", id=message["id"], format="full"
                ).execute()
                email_contents.append(msg)
                logger.info(f"Fetched message {message['id']}")

                # Modify the message to mark it as read (remove the UNREAD label)
                modified_message = {
                    "removeLabelIds": ["UNREAD"]
                }
                service.users().messages().modify(
                    userId="me", id=message["id"], body=modified_message
                ).execute()
                logger.info(f"Marked message {message['id']} as read")
            except HttpError as error:
                logger.error(f"Error fetching/modifying message {message['id']}: {error}")
            except Exception as e:
                logger.error(f"Unexpected error fetching/modifying message {message['id']}: {e}")

        logger.info(f"Successfully fetched and marked as read {len(email_contents)} unread emails for today")
        return email_contents

    except HttpError as error:
        logger.error(f"Error listing messages: {error}")
        return []
    except Exception as e:
        logger.error(f"Unexpected error listing messages: {e}")
        return []
