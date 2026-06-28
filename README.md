# Collaborative IDE

A full-stack collaborative code editor skeleton with basic real-time multi-file synchronization:

- Next.js + TypeScript frontend
- Monaco editor visible on the frontend
- Node.js + Express backend
- Socket.io room-based synchronization with in-memory workspace state
- Backend `/health` endpoint

Authentication, AI features, cursor tracking, and PostgreSQL integration are intentionally not implemented yet.

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

## Test Multi-File Real-Time Sync

Start both apps, then open two browser tabs at:

```text
http://localhost:3000
```

Both tabs use the hardcoded workspace and file:

```text
workspaceId = demo
fileId = main.ts
```

Typing in one Monaco editor tab should update the other tab live for the selected file.

Open a third tab after making edits. It should immediately load the latest code
and file list from the backend's in-memory workspace state.

Basic Week 3 test:

1. Open Tab A and Tab B.
2. Create a new file in Tab A.
3. Confirm the file appears in Tab B.
4. Rename the file in Tab B.
5. Confirm the new name appears in Tab A.
6. Type different code in different files.
7. Switch between files and confirm each file keeps its own content.
8. Open Tab C and confirm it loads all files with the latest names and contents.
