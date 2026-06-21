# Collaborative IDE

A full-stack collaborative code editor skeleton with basic real-time code synchronization:

- Next.js + TypeScript frontend
- Monaco editor visible on the frontend
- Node.js + Express backend
- Socket.io room-based synchronization
- Backend `/health` endpoint

Authentication, AI features, cursor tracking, multi-file UI, and PostgreSQL integration are intentionally not implemented yet.

## Project Structure

```text
.
├── backend
│   └── src
│       └── index.ts
├── frontend
│   └── app
│       ├── globals.css
│       ├── layout.tsx
│       └── page.tsx
├── package.json
└── README.md
```

## Prerequisites

- Node.js 20+
- npm 10+

## Setup

Install dependencies from the repository root:

```bash
npm install
```

## Run the Frontend

```bash
npm run dev --workspace frontend
```

The frontend runs at:

```text
http://localhost:3000
```

## Run the Backend

In a second terminal:

```bash
npm run dev --workspace backend
```

The backend runs at:

```text
http://localhost:4000
```

Check the health endpoint:

```bash
curl http://localhost:4000/health
```

Expected response:

```json
{
  "status": "ok"
}
```

## Test Real-Time Sync

Start both apps, then open two browser tabs at:

```text
http://localhost:3000
```

Both tabs use the hardcoded workspace and file:

```text
workspaceId = demo
fileId = main.ts
```

Typing in one Monaco editor tab should update the other tab live.
