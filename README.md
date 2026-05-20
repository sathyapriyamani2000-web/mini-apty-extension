Mini Apty — Local development
=============================

Quick start (development)

1. Copy the example env and set a secure JWT secret:

   cp .env.example .env

2. Start the backend with Docker Compose:

```bash
docker compose up --build
```

This runs the backend on http://localhost:3000. The Compose setup mounts the repository into the container and runs the backend in watch mode.

Run the backend test harness:

```bash
pnpm --filter backend test
```

Extension (build + load)

1. Build the extension bundle:

```bash
pnpm --filter extension build
```

2. Run the extension sanity check:

```bash
pnpm --filter extension test
```

3. Load in Chrome

- Open `chrome://extensions/` and enable Developer mode
- Click "Load unpacked" and select `apps/extension/dist`

Notes & tradeoffs

- The Docker configuration is tuned for reviewer convenience (mounted workspace, dev server). For production you'd build a smaller image and run a compiled server.
- `DATABASE_URL` defaults to a SQLite file inside the repo: `apps/backend/prisma/dev.db`. For shared CI or production use a managed DB and update `DATABASE_URL` accordingly.
- The extension uses a background service worker to proxy API requests to the backend and persists playback progress in `chrome.storage.local`.
- The extension popup is implemented as a React UI and uses Zustand for state management and Zod for validation.

Notes

- The popup sends commands to the active tab content script for save/playback flow.
- The content script still renders the in-page recorder panel and now accepts remote commands from the popup.
- Extend the popup to support walkthrough selection or step-level editing as needed.
