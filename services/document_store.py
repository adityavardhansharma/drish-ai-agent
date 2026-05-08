from dataclasses import dataclass, field
from threading import Lock
from typing import Dict, List


@dataclass
class DocumentState:
    content: str = ""
    chat_history: List[dict] = field(default_factory=list)


class DocumentStore:
    def __init__(self):
        self._states: Dict[str, DocumentState] = {}
        self._lock = Lock()

    def set_document(self, session_id, content):
        with self._lock:
            self._states[session_id] = DocumentState(content=content)

    def get_document(self, session_id):
        with self._lock:
            return self._states.get(session_id, DocumentState()).content

    def get_chat_history(self, session_id):
        with self._lock:
            state = self._states.get(session_id, DocumentState())
            return list(state.chat_history)

    def append_chat_turn(self, session_id, user_message, assistant_message):
        with self._lock:
            state = self._states.setdefault(session_id, DocumentState())
            state.chat_history.extend([user_message, assistant_message])
            return list(state.chat_history)


document_store = DocumentStore()
