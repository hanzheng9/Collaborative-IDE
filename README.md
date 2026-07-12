# Collaborative IDE

A local full-stack collaborative code editor prototype built with Next.js, TypeScript, Monaco Editor, Express, and Socket.io.

The app supports real-time multi-file editing across browser tabs, collaborator awareness, remote text cursors, and click-to-jump navigation. PostgreSQL groundwork exists, but the current polished MVP can still run in memory for local learning and demo use.

## Features

- Multi-file workspace in the hardcoded `demo` room
- Create, rename, and switch files
- In-app create/rename dialogs with validation
- Duplicate filename feedback
- Monaco Editor with language detection by file extension
- Per-file editor view state for cursor and scroll restoration
- Real-time code synchronization across connected tabs
- New tabs receive the latest workspace state
- Active collaborator list
- Current-file awareness
- Remote text cursor decorations
- Click a collaborator to jump to their file and cursor line
- Connection status: connecting, connected, disconnected, reconnecting
- Session sync status: synced, syncing, unsynced changes, connection lost

## Architecture

```text
frontend/
  app/
    components/
      CodeEditor.tsx
      CollaboratorList.tsx
      ConnectionStatus.tsx
      FileDialog.tsx
      FileSidebar.tsx
    page.tsx

backend/
  src/
    index.ts
    database.ts
```

The backend keeps active workspace state in memory for fast Socket.io updates. Collaborator presence and cursor positions are intentionally in memory only.

Socket.io events include:

- `join-workspace`
- `workspace-state`
- `create-file`
- `file-created`
- `rename-file`
- `file-renamed`
- `code-change`
- `file-selected`
- `cursor-change`
- `collaborators-state`

## Prerequisites

- Node.js 20+
- npm 10+

## Setup

Install dependencies from the repository root:

```bash
npm install
```

## Run Locally

Start the frontend:

```bash
npm run dev --workspace frontend
```

Start the backend in another terminal:

```bash
npm run dev --workspace backend
```

Open:

```text
http://localhost:3000
```

Backend health check:

```bash
curl http://localhost:4000/health
```

Expected response:

```json
{
  "status": "ok"
}
```

## Multi-Tab Test

1. Open Tab A, Tab B, and Tab C at `http://localhost:3000`.
2. Confirm all collaborators appear.
3. Create several files.
4. Confirm all files appear in every tab.
5. Rename files from different tabs.
6. Confirm names synchronize correctly.
7. Add different code to each file.
8. Switch files repeatedly and confirm content stays separate.
9. Confirm language mode changes based on extensions such as `.ts`, `.py`, `.json`, `.sql`, and `.md`.
10. Move the text caret in one tab and confirm remote cursors appear only for users viewing the same file.
11. Click another collaborator to jump to their current file and cursor.
12. Close one tab and confirm that collaborator disappears.
13. Stop the backend and confirm disconnected status appears.
14. Restart the backend and confirm the frontend reconnects cleanly.

## Optional PostgreSQL

The project includes early PostgreSQL groundwork for durable workspaces and files. To try it locally, create a database and set:

```bash
export DATABASE_URL="postgres://USER:PASSWORD@localhost:5432/collaborative_ide"
```

The backend creates the required tables automatically. The schema is also available at:

```text
backend/schema.sql
```

## Known Limitations

- No authentication or permissions
- No deployment configuration yet
- No CRDT or operational transform
- Concurrent edits use simple last-write-wins behavior
- Collaborator presence and cursor positions reset on backend restart
- PostgreSQL persistence still needs fuller production-style testing

## Future Work

- Finish and harden PostgreSQL persistence
- Add deployment configuration
- Add user authentication
- Add permissions or workspace sharing
- Add optional AI assistant features
- Add stronger conflict handling for simultaneous edits
