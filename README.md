# Collaborative IDE

A local full-stack collaborative code editor prototype built with Next.js, TypeScript, Monaco Editor, Express, and Socket.io.

The app supports real-time multi-file editing across browser tabs, collaborator awareness, remote text cursors, click-to-jump navigation, selected-code AI assistance, local code execution through a backend execution API, and optional PostgreSQL persistence. The in-memory workspace remains the live source of truth while the server is running, and PostgreSQL is used for durable storage across restarts.

## Features

- Multi-file workspaces with independent shareable URLs
- Shareable workspace URLs such as `/workspace/abc123`
- Landing page for creating or joining workspaces
- Anonymous collaborators with temporary names such as `User4837`
- Explicit Leave Workspace action for removing only live presence
- Browser-local recent workspace history
- Create, rename, delete, and switch files
- In-app create, rename, and delete confirmation dialogs with validation
- Duplicate filename feedback
- Monaco Editor with language detection by file extension
- Per-file editor view state for cursor and scroll restoration
- Real-time code synchronization across connected tabs
- New tabs receive the latest workspace state
- Optional PostgreSQL persistence for workspaces and files
- Debounced file content saves to avoid writing every keystroke
- 30-day workspace inactivity lifecycle when PostgreSQL is enabled
- Active collaborator list
- Current-file awareness
- Remote text cursor decorations
- Click a collaborator to jump to their file and cursor line
- Selected-code AI assistant actions: Explain, Refactor, Fix Bug, Generate Tests, and Optimize
- AI suggestions are shown for review and never applied automatically
- Replace Selection uses Monaco edits so undo/redo and existing Socket.io sync continue to work
- Run Code support for JavaScript, TypeScript, and Python
- Standard input and local-only output panel
- Stop button for cancelling a local execution request
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
      AiActionToolbar.tsx
      AiAssistantPanel.tsx
      AiResultView.tsx
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
    ai/
      aiPrompts.ts
      aiRouter.ts
      aiService.ts
      aiTypes.ts
      aiValidation.ts
      azureAiClient.ts
    execution/
      executionProvider.ts
      executionRouter.ts
      executionService.ts
      executionTypes.ts
      executionValidation.ts
      languageRegistry.ts
      pistonExecutionProvider.ts
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

Durable state:

```text
PostgreSQL -> workspaces + files
```

Ephemeral state:

```text
Memory -> collaborators + cursors + current-file awareness
```

Backend responsibilities:

- `app.ts`: Express app and `/health`
- `server.ts`: HTTP server, Socket.io server, database startup, and graceful shutdown
- `socketHandlers.ts`: Socket.io event flow and room broadcasting
- `workspaceService.ts`: workspace/file state operations and debounced persistence calls
- `debouncedPersistence.ts`: delayed content saves so only the latest code is persisted after a short pause
- `database.ts`: PostgreSQL migration, workspace/file loading, saving, renaming, content updates, deletion, and connection cleanup
- `socketValidation.ts`: runtime validation for incoming socket payloads
- `ai/`: Azure OpenAI client setup, prompt construction, validation, service orchestration, and `/api/ai/assist`
- `execution/`: code execution validation, provider abstraction, Piston integration, execution orchestration, and `/api/execution/run`

Frontend responsibilities:

- `page.tsx`: landing page for creating or joining workspaces
- `workspace/[workspaceId]/page.tsx`: dynamic workspace route
- `workspaceRouter.ts`: workspace ID generation, validation, parsing, and URL creation
- `WorkspaceLanding.tsx`: create/join UI
- `WorkspacePage.tsx`: collaborative editor page layout and dialogs
- `useCollaborativeWorkspace.ts`: Socket.io client lifecycle, editor sync, collaborator state, remote cursors, and jump-to-collaborator behavior
- `AiAssistantPanel.tsx`: selected-code AI request UI, Markdown result rendering, copy, retry, and explicit replacement
- `ExecutionPanel.tsx`: Run Code output, standard input, copy, clear, and stop controls
- `components/`: focused UI pieces for files, collaborators, editor, dialogs, and status

## AI Assistant Flow

```text
Monaco selection
  -> Next.js client
  -> Express POST /api/ai/assist
  -> Azure OpenAI gpt-5-nano deployment
  -> Result shown for user review
  -> Optional Replace Selection
  -> Existing Socket.io synchronization
```

The browser only sends the selected code, current file name, Monaco language, and limited surrounding context. It does not send the full workspace. The backend reads Azure credentials from environment variables and never returns them to the browser.

## Code Execution Flow

```text
Active Monaco file
  -> Next.js client
  -> Express POST /api/execution/run
  -> External isolated execution provider
  -> Normalized result
  -> Local output panel
```

Run Code supports:

- JavaScript
- TypeScript
- Python

Code execution is intentionally not sent through Socket.io, not broadcast to collaborators, and not persisted. Each user sees only their own run output.

## Terminal

The Terminal tab provides a browser-local command interface for the current
workspace. It uses the existing isolated execution provider for supported code
commands and keeps terminal output local to the current browser tab.

Supported commands:

- `python main.py`
- `python3 main.py`
- `node main.js`
- `npx tsx main.ts`
- `ls`
- `pwd`
- `clear`
- `help`

Commands execute independently in an isolated execution environment. The
terminal does not currently maintain a persistent shell session, so commands
such as `cd src` do not change future command working directories. Package
installation commands such as `npm install react`, Git commands, and environment
variable inspection are intentionally unavailable in the current terminal model.

Terminal history is stored only in the current browser session. Terminal input
and output are not synchronized through Socket.io and are not persisted to
PostgreSQL.

## Workspace URLs

The app no longer uses a hardcoded workspace. The landing page creates a unique workspace ID and redirects to:

```text
/workspace/{workspaceId}
```

Opening the same URL joins the same Socket.io room, memory workspace cache, and PostgreSQL workspace record. Different workspace URLs remain isolated from each other.

Socket.io events include:

- `join-workspace`
- `leave-workspace`
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

## Workspace Lifecycle

Workspaces are persistent anonymous collaboration spaces.

Each workspace:

- has a shareable URL
- stores files in PostgreSQL when `DATABASE_URL` is configured
- can be reopened later
- expires after 30 days of inactivity

Workspace activity includes joining, creating a workspace, creating files, renaming files, deleting files, and persisted content updates. Cursor movement and collaborator presence do not update the database timestamp because they are ephemeral and frequent.

The backend runs expired-workspace cleanup once during startup and then once every 24 hours by default. These defaults can be changed with:

```bash
WORKSPACE_RETENTION_DAYS="30"
WORKSPACE_CLEANUP_INTERVAL_HOURS="24"
```

Expired cleanup deletes only workspaces with `updated_at` older than the retention window and excludes workspaces currently loaded in memory.

## Anonymous Collaborators

Collaborators use temporary names such as `User4837`. Names, colors, cursors, and presence exist only for the current live session. They are never saved to PostgreSQL, so refreshing, reconnecting, or restarting the backend may assign a new temporary name.

## Anonymous Workspace History

Recent workspace history is stored only in the user's browser. It is not an account feature and is not synchronized between devices.

The history list:

- keeps up to 10 recent workspaces
- stores metadata only: workspace ID, display name, last visited time, and optional last file name
- never stores file contents, source code, cursors, or collaborator names
- is not saved to PostgreSQL
- is not synchronized through Socket.io

Removing a workspace from recent history only removes the local browser entry. It does not delete the workspace or affect other collaborators. A workspace itself still expires after 30 days of inactivity, so an expired workspace may remain in local history until the user attempts to reopen it.

## Leave Workspace

`Leave Workspace` opens a confirmation dialog before removing the current browser tab from live presence and navigating back home. It does not delete the workspace, files, recent-history entry, or any other collaborator's state. Closing a browser tab uses the same backend presence cleanup path.

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

AI assistant environment variables, set only for the backend:

```bash
AZURE_OPENAI_API_KEY="your-api-key"
AZURE_OPENAI_ENDPOINT="https://your-resource-or-project-endpoint"
AZURE_OPENAI_DEPLOYMENT="gpt-5-nano"
```

Do not prefix these with `NEXT_PUBLIC_`.

Optional local AI rate-limit overrides:

```bash
AI_RATE_LIMIT_MAX="5"
AI_RATE_LIMIT_WINDOW_MS="600000"
AI_MAX_CODE_CHARS="2000"
AI_MAX_CONTEXT_CHARS="1500"
AI_MAX_OUTPUT_TOKENS="400"
```

For local testing, you can temporarily increase `AI_RATE_LIMIT_MAX` or lower `AI_RATE_LIMIT_WINDOW_MS`. Restart the backend after changing these values.

Optional code execution environment variables, set only for the backend:

```bash
CODE_EXECUTION_PROVIDER="piston"
PISTON_API_URL="https://emkc.org/api/v2/piston"
PISTON_API_KEY=""
PISTON_JAVASCRIPT_VERSION="18.15.0"
PISTON_TYPESCRIPT_VERSION="5.0.3"
PISTON_PYTHON_VERSION="3.10.0"
EXECUTION_RATE_LIMIT_MAX="10"
EXECUTION_RATE_LIMIT_WINDOW_MS="300000"
```

The backend uses an execution provider abstraction so another sandbox provider can be added later. The current implementation uses Piston-compatible APIs. For the public Piston service, use `https://emkc.org/api/v2/piston` as the base URL. If you self-host Piston, set `PISTON_API_URL` to that instance's API base, or to the full `/execute` URL.

For local Piston development:

```bash
docker run --privileged -v /tmp/piston:/piston -dit -p 2000:2000 --name piston_api ghcr.io/engineer-man/piston
curl -X POST http://localhost:2000/api/v2/packages -H "Content-Type: application/json" -d '{"language":"node","version":"18.15.0"}'
curl -X POST http://localhost:2000/api/v2/packages -H "Content-Type: application/json" -d '{"language":"typescript","version":"5.0.3"}'
curl -X POST http://localhost:2000/api/v2/packages -H "Content-Type: application/json" -d '{"language":"python","version":"3.10.0"}'
```

Then set:

```bash
PISTON_API_URL="http://localhost:2000/api/v2"
PISTON_API_KEY=""
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
- Leave Workspace confirmation behavior
- Browser-local recent workspace history behavior
- Landing page recent workspace rendering and local removal
- Collaborator list rendering and click handling
- AI route validation, provider failure handling, empty responses, mocked provider calls, and rate limiting
- AI panel no-selection, loading, error, copy, explicit replacement, and disabled-action states
- Code execution validation, safe filename checks, language support, provider failures, output truncation, and rate limiting
- Run Code panel loading, stdout/stderr rendering, stdin, stop, copy, clear, button run, and keyboard run behavior
- Anonymous collaborator names, explicit workspace leave, missing-workspace handling, and workspace lifecycle service behavior

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
12. Click Leave Workspace in one tab and confirm that collaborator disappears while files remain.
13. Close one tab and confirm that collaborator disappears.
14. Stop the backend and confirm disconnected status appears.
15. Restart the backend and confirm the frontend reconnects cleanly.

## Current Policies

- A workspace must always contain at least one file, so deleting the final file is blocked.
- While disconnected, Monaco is read-only and edits are paused instead of stored offline.
- Workspace IDs must be 3-64 characters and use letters, numbers, hyphens, or underscores.
- Direct unknown workspace URLs are not silently created when PostgreSQL persistence is enabled.
- On reconnect, the backend session state for the current workspace URL is treated as authoritative.
- Deleted files are removed by stable `fileId`; stale updates for deleted files are rejected.
- AI requests are limited to 5 requests per IP every 10 minutes by default.
- AI selected code is limited to 2,000 characters by default.
- AI surrounding context is trimmed to 1,500 characters by default.
- AI responses are capped at 400 output tokens by default.
- AI output is rendered as untrusted Markdown with raw HTML disabled.
- AI-generated code is never executed or inserted automatically.

## AI Manual Test

1. Select code in Monaco.
2. Click `Ask AI`.
3. Run Explain and confirm an explanation appears.
4. Run Refactor, Fix Bug, Generate Tests, and Optimize.
5. Confirm generated code is not inserted automatically.
6. Click Replace Selection for a replacement response.
7. Confirm only the selected range changes.
8. Use undo and confirm the original code returns.
9. Open the same workspace in another tab and confirm the AI-applied edit syncs through Socket.io.
10. Refresh and confirm the edit persists through the existing workspace persistence flow.
11. Try Ask AI with no selection and confirm the helpful warning appears.
12. Send repeated requests and confirm rate limiting eventually returns a friendly error.

## Code Execution Manual Test

1. Open a workspace.
2. Select or create a JavaScript, TypeScript, or Python file.
3. Click `Run Code` or press `Ctrl+Enter` / `Cmd+Enter`.
4. Confirm the output panel shows `Running...` and then the result.
5. Add standard input in the `Input` tab and run again.
6. Open the same workspace in another browser tab and confirm the run output appears only in the tab that ran the code.
7. Try running an unsupported file type and confirm a friendly error appears.

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
- missing workspaces are created only through the landing page's Create Workspace flow
- unknown or expired workspace URLs show a friendly not-found/expired state
- every workspace URL has independent files and database records
- file creation, rename, deletion, and content updates are persisted
- content updates are debounced, so typing still syncs instantly over Socket.io without writing every keystroke
- pending content writes are flushed during graceful shutdown
- workspace cleanup removes PostgreSQL workspaces after 30 days of inactivity

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
- AI requests are stateless and not persisted
- AI can only work on the current Monaco selection
- Code execution depends on a configured external execution provider
- Code execution is limited to JavaScript, TypeScript, and Python
- Run output is local to the requesting browser tab

## Code Execution Safety Notes

- The Express server does not execute submitted code directly.
- The backend does not use `eval`, `new Function`, shell commands, or `child_process` for user code.
- Provider credentials and URLs stay on the backend.
- Submitted filenames are validated to block path traversal and secret-like files.
- Execution requests are rate limited.
- Source, stdin, runtime, and output sizes are capped.
- Runtime is capped at 3 seconds to match local Piston's default limit.
- Results are rendered as plain text in the frontend output panel.

## Future Work

- Add deployment configuration
- Add user authentication
- Add permissions or workspace sharing
- Add stronger conflict handling for simultaneous edits
