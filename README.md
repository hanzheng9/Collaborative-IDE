# Collaborative IDE

A local full-stack collaborative code editor prototype built with Next.js, TypeScript, Monaco Editor, Express, and Socket.io.

The app supports real-time multi-file editing across browser tabs, collaborator awareness, remote text cursors, click-to-jump navigation, and optional PostgreSQL persistence. The in-memory workspace remains the live source of truth while the server is running, and PostgreSQL is used for durable storage across restarts.

## Features

- Multi-file workspaces with independent shareable URLs
- Shareable workspace URLs such as `/workspace/abc123`
- Landing page for creating or joining workspaces
- Create, rename, delete, and switch files
- In-app create, rename, and delete confirmation dialogs with validation
- Duplicate filename feedback
- Monaco Editor with language detection by file extension
- Per-file editor view state for cursor and scroll restoration
- Real-time code synchronization across connected tabs
- New tabs receive the latest workspace state
- Optional PostgreSQL persistence for workspaces and files
- Debounced file content saves to avoid writing every keystroke
- Active collaborator list
- Current-file awareness
- Remote text cursor decorations
- Click a collaborator to jump to their file and cursor line
- Connection status: connecting, connected, disconnected, reconnecting, reconnection failed
- Session sync status: synced, syncing, unsynced changes, connection lost
- Structured Socket.io error feedback for invalid file operations

## Architecture

```text
shared/
  src/
    socketEvents.ts

frontend/
  app/
    components/
      CodeEditor.tsx
      CollaboratorList.tsx
      ConnectionStatus.tsx
      DeleteFileDialog.tsx
      FileDialog.tsx
      FileSidebar.tsx
      WorkspaceLanding.tsx
      WorkspacePage.tsx
    hooks/
      useCollaborativeWorkspace.ts
    workspace/
      [workspaceId]/
        page.tsx
    page.tsx
    types.ts
    workspaceRouter.ts

backend/
  src/
    services/
      debouncedPersistence.ts
      workspaceService.ts
    validation/
      socketValidation.ts
    app.ts
    collaboratorState.ts
    config.ts
    index.ts
    database.ts
    logger.ts
    server.ts
    socketHandlers.ts
    workspaceState.ts
```

The app is split into three npm workspaces:

- `frontend`: Next.js UI, Monaco Editor, and the collaborative workspace hook
- `backend`: Express, Socket.io, in-memory workspace/collaborator state, and PostgreSQL persistence
- `shared`: TypeScript contracts for Socket.io events and payloads used by both frontend and backend

The backend keeps active workspace state in memory for fast Socket.io updates. PostgreSQL sits underneath that memory cache and only handles persistence. Collaborator presence and cursor positions are intentionally in memory only and do not persist across restarts.

Backend responsibilities:

- `app.ts`: Express app and `/health`
- `server.ts`: HTTP server, Socket.io server, database startup, and graceful shutdown
- `socketHandlers.ts`: Socket.io event flow and room broadcasting
- `workspaceService.ts`: workspace/file state operations and debounced persistence calls
- `debouncedPersistence.ts`: delayed content saves so only the latest code is persisted after a short pause
- `database.ts`: PostgreSQL migration, workspace/file loading, saving, renaming, content updates, deletion, and connection cleanup
- `socketValidation.ts`: runtime validation for incoming socket payloads

Frontend responsibilities:

- `page.tsx`: landing page for creating or joining workspaces
- `workspace/[workspaceId]/page.tsx`: dynamic workspace route
- `workspaceRouter.ts`: workspace ID generation, validation, parsing, and URL creation
- `WorkspaceLanding.tsx`: create/join UI
- `WorkspacePage.tsx`: collaborative editor page layout and dialogs
- `useCollaborativeWorkspace.ts`: Socket.io client lifecycle, editor sync, collaborator state, remote cursors, and jump-to-collaborator behavior
- `components/`: focused UI pieces for files, collaborators, editor, dialogs, and status

## Workspace URLs

The app no longer uses a hardcoded workspace. The landing page creates a unique workspace ID and redirects to:

```text
/workspace/{workspaceId}
```

Opening the same URL joins the same Socket.io room, memory workspace cache, and PostgreSQL workspace record. Different workspace URLs remain isolated from each other.

Socket.io events include:

- `join-workspace`
- `workspace-state`
- `create-file`
- `file-created`
- `rename-file`
- `file-renamed`
- `delete-file`
- `file-deleted`
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
npm run dev:frontend
```

Start the backend in another terminal:

```bash
npm run dev:backend
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

## Automated Tests

Run the full automated test suite:

```bash
npm test
```

Run one side at a time:

```bash
npm run test:backend
npm run test:frontend
```

Run coverage:

```bash
npm run test:coverage
```

The current tests cover:

- Workspace state logic
- Filename validation
- Language detection
- Collaborator presence state
- Express `/health`
- Socket.io collaboration flows
- File sidebar behavior
- File dialog and delete confirmation behavior
- Collaborator list rendering and click handling

## Multi-Tab Test

1. Open `http://localhost:3000`.
2. Create a workspace.
3. Copy the workspace URL with Share.
4. Open the same URL in Tab B and Tab C.
5. Confirm all collaborators appear.
6. Create, rename, delete, and switch files.
7. Confirm edits synchronize only between tabs on the same workspace URL.
8. Open a different workspace URL and confirm it is isolated.
9. Refresh a workspace tab and confirm files and editor contents reload.
10. Move the text caret in one tab and confirm remote cursors appear only for users viewing the same file.
11. Click another collaborator to jump to their current file and cursor.
12. Close one tab and confirm that collaborator disappears.
13. Stop the backend and confirm disconnected status appears.
14. Restart the backend and confirm the frontend reconnects cleanly.

## Current Policies

- A workspace must always contain at least one file, so deleting the final file is blocked.
- While disconnected, Monaco is read-only and edits are paused instead of stored offline.
- Workspace IDs must be 3-64 characters and use letters, numbers, hyphens, or underscores.
- On reconnect, the backend session state for the current workspace URL is treated as authoritative.
- Deleted files are removed by stable `fileId`; stale updates for deleted files are rejected.

## Optional PostgreSQL

The project can run without PostgreSQL. If `DATABASE_URL` is not set, workspace data stays in memory and resets when the backend restarts.

To persist workspaces and files across backend restarts, create a database and set:

```bash
export DATABASE_URL="postgres://USER:PASSWORD@localhost:5432/collaborative_ide"
```

The backend creates the required tables automatically. The schema is also available at:

```text
backend/schema.sql
```

With PostgreSQL enabled:

- the backend runs `migrateDatabase()` before accepting requests
- the first user joining a workspace loads files from PostgreSQL if they exist
- missing workspaces are created in memory and then persisted
- every workspace URL has independent files and database records
- file creation, rename, deletion, and content updates are persisted
- content updates are debounced, so typing still syncs instantly over Socket.io without writing every keystroke
- pending content writes are flushed during graceful shutdown

## Persistence Test

1. Set `DATABASE_URL`.
2. Start the backend and frontend.
3. Create a workspace from the landing page.
4. Add different content to each file.
5. Stop and restart the backend.
6. Reopen or refresh the same `/workspace/{workspaceId}` URL.
7. Confirm files, names, languages, and contents are restored.
8. Confirm collaborators and cursors reset after restart.

## Known Limitations

- No authentication or permissions
- No deployment configuration yet
- No CRDT or operational transform
- Concurrent edits use simple last-write-wins behavior
- Collaborator presence and cursor positions reset on backend restart
- PostgreSQL persistence still needs fuller production-style testing and deployment hardening

## Future Work

- Add deployment configuration
- Add user authentication
- Add permissions or workspace sharing
- Add optional AI assistant features
- Add stronger conflict handling for simultaneous edits
