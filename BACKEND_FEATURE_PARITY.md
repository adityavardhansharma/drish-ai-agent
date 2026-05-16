# Backend Feature Parity

The Python backend features were migrated into TypeScript as follows:

- App startup/config validation: `main.py`, `utils/config.py`, and `utils/logger.py` -> `backend/config.ts`, `backend/logger.ts`, `backend/server.ts`
- Static frontend serving: `routes/page_routes.py` -> `backend/server.ts`
- JSON and SSE API routes: `routes/api_routes.py` -> `backend/server.ts`
- Email fetch orchestration and progress events: `services/agent_services.py` -> `backend/services.ts`
- Gmail OAuth, unread-today fetch, mark-as-read, and threaded reply sending: `email_utils/gmail_api.py` -> `backend/gmail.ts`
- Gmail header/body parsing: `email_utils/email_parser.py` -> `backend/emailParser.ts`
- OpenRouter chat completion, email summaries, and draft replies: `llm/openrouter_client.py`, `llm/email_summary_api.py`, `llm/email_reply_api.py` -> `backend/openrouterClient.ts`, `backend/llm.ts`
- Convex summary persistence, draft updates, sent/failed reply state, and list summaries: `services/convex_store.py`, `services/email_artifact_store.py` -> `backend/convexStore.ts`

Preserved HTTP contract:

- `GET /api/emails/fetch`
- `GET /api/emails/summaries?limit=100`
- `POST /api/emails/reply`
- `POST /api/emails/draft`
- `POST /api/emails/generate_reply`
