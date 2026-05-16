# AI Agent Pro

Electron desktop app with a Flask backend for Gmail summarization, reply
drafting, and persisted email workflow state.

All AI text and vision calls go through OpenRouter. Configure the provider and
models in `.env` using the `OPENROUTER_*` variables shown in `.env.example`.

Email summaries, generated draft replies, edited reply drafts, and sent reply
state are persisted in Convex.

## Setup

1. Install Python dependencies:

   ```bash
   pip install -r requirements.txt
   ```

2. Install Node dependencies:

   ```bash
   npm install
   ```

3. Create local environment config:

   ```bash
   cp .env.example .env
   ```

4. Add local Google credential files under `secrets/`:

   - `secrets/credentials.json` for Gmail OAuth

5. Configure Convex for email persistence:

   ```bash
   npm install
   npx convex dev
   npx convex env set CONVEX_APP_SECRET "$(openssl rand -hex 32)"
   ```

   Copy the same secret into `CONVEX_APP_SECRET` in `.env`, and set `CONVEX_URL`
   to the deployment URL from the Convex dashboard.

6. Start the desktop app:

   ```bash
   npm start
   ```

## Development Notes

`electron.js` owns the Flask server process. `start.js` only launches Electron, which avoids duplicate Flask processes on port `5000`.

Flask routes are split between:

- `routes/page_routes.py` for HTML pages
- `routes/api_routes.py` for JSON/SSE APIs

Business logic lives in `services/`, separate from HTTP routing.
