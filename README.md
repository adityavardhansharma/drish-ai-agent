# AI Agent Pro

Electron desktop app with a TypeScript backend for Gmail summarization, reply
drafting, and persisted email workflow state.

All AI text and vision calls go through OpenRouter. Configure the provider and
models in `.env` using the `OPENROUTER_*` variables shown in `.env.example`.

Email summaries, generated draft replies, edited reply drafts, and sent reply
state are persisted in Convex.

## Setup

1. Install Node dependencies:

   ```bash
   npm install
   ```

2. Create local environment config:

   ```bash
   cp .env.example .env
   ```

   The app defaults to port `5000`. To run it on another port for one launch,
   set `PORT` in the shell, for example `PORT=5001 npm start`.

3. Add local Google credential files under `secrets/`:

   - `secrets/credentials.json` for Gmail OAuth

4. Configure Convex for email persistence:

   ```bash
   npm install
   npx convex dev
   npx convex env set CONVEX_APP_SECRET "$(openssl rand -hex 32)"
   ```

   Copy the same secret into `CONVEX_APP_SECRET` in `.env`, and set `CONVEX_URL`
   to the deployment URL from the Convex dashboard.

5. Start the desktop app:

   ```bash
   npm start
   ```

   For development, start the Vite frontend, TypeScript backend, and Electron
   together with one command:

   ```bash
   npm run dev
   ```

## Frontend

The only frontend source is the Vite app in `gui/`. Build output is written to
`static/dist/`, and the TypeScript backend serves that directory for Electron.

Useful frontend commands:

```bash
npm run frontend
npm run build:frontend
```

## Development Notes

`electron.js` owns the TypeScript backend process. `start.js` only launches Electron, which avoids duplicate backend processes on port `5000`.

Backend modules live under `backend/`:

- `backend/server.ts` serves the frontend and JSON/SSE APIs
- `backend/services.ts` orchestrates Gmail, OpenRouter, and Convex workflows
- `backend/gmail.ts`, `backend/llm.ts`, `backend/emailParser.ts`, and `backend/convexStore.ts` hold integrations

Useful checks:

```bash
npm run typecheck
```
