# Collaborative IDE

A full-stack real-time collaborative code editor inspired by Google Docs for code. Collaborative IDE supports shareable multi-file workspaces, live multi-user editing, persistent workspace storage, sandboxed code execution, and selected-code AI assistance.

[Live Demo](https://collaborative-ide-frontend.vercel.app)

## Demo

### Collaboration Demo

![Split-screen demo showing real-time collaboration between workspace users.](docs/screenshots/collaboration-demo-short.gif)

Two users edit the same workspace in split screen. Code changes and newly created files sync live through Socket.io.

### Remote Cursor Tracking

![Split-screen demo showing remote Monaco cursor tracking between collaborators.](docs/screenshots/remote-cursor-tracking.gif)

Remote cursor decorations show where collaborators are editing. Clicking a collaborator jumps to their cursor, including when they are viewing a different file.

### Landing Page

![Collaborative IDE landing page with Create Workspace and Join Existing Workspace controls.](docs/screenshots/landing-page.png)

### Editor Workspace

![Light-mode Collaborative IDE workspace with Monaco editor, file sidebar, output panel, collaborators, and status bar.](docs/screenshots/editor-light.png)

### Dark Mode

![Dark-mode Collaborative IDE workspace with synchronized editor, file explorer, bottom panel, and status bar.](docs/screenshots/editor-dark.png)

### Code Execution

![Collaborative IDE output panel showing a successful code execution result.](docs/screenshots/code-execution.png)

### Real-Time Collaboration

![Collaborative IDE workspace with three connected collaborators and remote cursor indicators in Monaco.](docs/screenshots/realtime-collaboration.png)

### AI Assistant

![Collaborative IDE AI assistant panel showing selected-code bug fix output and a Replace Selection review action.](docs/screenshots/ai-assistant.png)

### Full Demo Video

<!--
Add a longer walkthrough video link here.
Suggested flow: landing page, shareable workspace URL, multi-file editing,
real-time collaboration, AI assistant, code execution, theme toggle, and
persistence after refresh.

Example:
[Watch the full demo](https://your-demo-video-link.example)
-->

## Why This Project Is Interesting

Collaborative IDE is not just a Monaco editor wrapper. It combines real-time synchronization, durable workspace persistence, ephemeral collaborator awareness, external code execution, AI-assisted editing, and public-deployment safety controls in one full-stack TypeScript application.

The project intentionally separates live collaboration state from durable storage:

- Memory is authoritative while the backend is running.
- PostgreSQL provides persistence across restarts.
- Socket.io handles live updates, presence, file selection, and cursor awareness.
- Presence and cursors are ephemeral and never persisted.
- User code is executed by external sandbox providers, never directly inside Express.

## Tech Stack

| Area | Technology |
| --- | --- |
| Frontend | Next.js, React, TypeScript, Carbon React |
| Editor | Monaco Editor |
| Real-time | Socket.io |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL, Neon |
| AI | Azure AI Foundry / Azure OpenAI `gpt-5-nano` |
| Code execution | Piston locally, Judge0/RapidAPI in production |
| Deployment | Vercel frontend, Railway backend |
| Testing | Vitest, Testing Library, Supertest |

## Core Features

- Shareable `/workspace/{workspaceId}` URLs
- Anonymous collaborative workspaces
- Real-time multi-user code synchronization
- Multi-file workspace model
- Create, rename, delete, and switch files with real-time synchronization
- Persistent workspace and file storage in PostgreSQL
- User-facing workspace names with inline rename support
- Browser-local recent workspace history
- Anonymous temporary collaborator names and colors
- Active collaborator list with current-file awareness
- Remote Monaco cursor decorations
- Click a collaborator to jump to their file and cursor
- Explicit Leave Workspace flow
- Light/dark theme support
- Resizable Input / Output / Terminal lower panel
- Code execution for JavaScript, TypeScript, and Python
- Browser-local terminal interface for supported commands
- Selected-code AI assistant actions:
  - Explain
  - Refactor
  - Fix Bug
  - Generate Tests
  - Optimize
- AI responses are reviewed before code replacement
- Rate limiting for AI and code execution
- PostgreSQL-backed monthly Judge0 execution cap
- Automated frontend and backend tests

## Architecture

```text
frontend/                 backend/                      PostgreSQL
Next.js + Monaco          Express + Socket.io            durable workspaces
      |                         |                         durable files
      | Socket.io rooms         |                         execution usage cap
      v                         v
Collaborative UI  <---->  WorkspaceService
                              |
                              v
                        In-memory workspace cache
                        In-memory collaborators/cursors
```

The app is split into three npm workspaces:

- `frontend`: Next.js UI, Monaco Editor, Socket.io client, AI/execution panels
- `backend`: Express API, Socket.io server, workspace service, PostgreSQL persistence
- `shared`: TypeScript Socket.io event contracts shared by frontend and backend

### Repository Layout

```text
shared/
  src/socketEvents.ts

frontend/
  app/
    components/
    hooks/useCollaborativeWorkspace.ts
    workspace/[workspaceId]/page.tsx
    workspaceRouter.ts
    backendUrl.ts

backend/
  src/
    ai/
    execution/
    services/
    validation/
    database.ts
    server.ts
    socketHandlers.ts
    workspaceState.ts
```

## Real-Time Collaboration

Each workspace URL maps to one Socket.io room. Users opening the same URL join the same room and receive the latest in-memory workspace state.

Important events include:

- `join-workspace`
- `workspace-state`
- `rename-workspace`
- `workspace-renamed`
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

Edits are broadcast immediately to other users in the same workspace. New tabs receive the current workspace state on join. Concurrent editing currently uses last-write-wins behavior rather than CRDT or operational transform.

## Persistence Model

PostgreSQL stores durable workspace data:

- workspace ID
- workspace display name
- files
- file names
- languages
- contents
- timestamps
- monthly execution usage

Memory stores live collaboration data:

- active workspace cache
- connected collaborators
- temporary user names/colors
- current file per collaborator
- cursor positions

File content saves are debounced so typing remains real-time over Socket.io without writing every keystroke to PostgreSQL. Pending writes are flushed during graceful shutdown.

Workspaces expire after 30 days of inactivity when PostgreSQL is enabled. Cursor movement and collaborator presence do not update workspace activity because they are ephemeral and high-frequency.

## AI Assistant Flow

```text
Monaco selection
  -> Frontend AI panel
  -> POST /api/ai/assist
  -> Azure OpenAI deployment
  -> Markdown response
  -> Optional explicit Replace Selection
  -> Existing Socket.io sync
```

The browser sends only:

- selected code
- file name
- Monaco language
- limited surrounding context

The backend owns all Azure credentials. AI output is rendered as untrusted Markdown with raw HTML disabled. AI-generated code is never inserted automatically; the user must click Replace Selection.

## Code Execution Flow

```text
Active file + stdin
  -> POST /api/execution/run
  -> execution provider abstraction
  -> Piston locally or Judge0 in production
  -> normalized ExecutionResult
  -> local Output / Terminal panel
```

Supported languages:

- JavaScript
- TypeScript
- Python

Execution output is local to the requesting browser tab. It is not broadcast through Socket.io and is not persisted.

Security and cost controls:

- Express does not execute submitted code directly.
- The backend does not use `eval`, `new Function`, shell commands, or `child_process` for user code.
- Provider credentials stay backend-only.
- File names are validated to block path traversal and secret-like files.
- Source, stdin, output size, and runtime are capped.
- Execution endpoint is rate limited.
- Judge0 production execution has a PostgreSQL-backed monthly cap.

## Terminal

The Terminal tab is a browser-local command interface for the current workspace. It uses the same isolated execution provider as Run Code and does not maintain a persistent shell session.

Supported commands:

- `python main.py`
- `python3 main.py`
- `node main.js`
- `npx tsx main.ts`
- `ls`
- `pwd`
- `clear`
- `help`

Unsupported by design:

- `cd` changing future command context
- package installation commands
- Git commands
- environment variable inspection

Terminal history is stored only in the current browser session.

## Deployment

| Service | Platform |
| --- | --- |
| Frontend | Vercel |
| Backend | Railway |
| Database | Neon PostgreSQL |

Production frontend:

```text
https://collaborative-ide-frontend.vercel.app
```

The frontend must be built with:

```bash
NEXT_PUBLIC_BACKEND_URL="https://your-railway-backend-url"
```

The Railway backend should allow the Vercel frontend origin:

```bash
CORS_ORIGIN="https://collaborative-ide-frontend.vercel.app"
```

## Local Setup

### Prerequisites

- Node.js 20+
- npm 10+

### Install

```bash
npm install
```

### Run Frontend

```bash
npm run dev:frontend
```

Frontend runs at:

```text
http://localhost:3000
```

### Run Backend

```bash
npm run dev:backend
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

## Environment Variables

Backend variables belong in the backend environment only. Do not prefix secrets with `NEXT_PUBLIC_`.

### Frontend

```bash
NEXT_PUBLIC_BACKEND_URL="http://localhost:4000"
```

Use the deployed Railway backend URL in Vercel.

### Backend Core

```bash
PORT="4000"
CORS_ORIGIN="http://localhost:3000"
DATABASE_URL="postgres://USER:PASSWORD@HOST:PORT/DATABASE"
WORKSPACE_RETENTION_DAYS="30"
WORKSPACE_CLEANUP_INTERVAL_HOURS="24"
```

`DATABASE_URL` is optional for local development. Without it, workspace data stays in memory and resets when the backend restarts.

### Azure AI

```bash
AZURE_OPENAI_API_KEY="your-api-key"
AZURE_OPENAI_ENDPOINT="https://your-resource-or-project-endpoint"
AZURE_OPENAI_DEPLOYMENT="gpt-5-nano"
AI_RATE_LIMIT_MAX="5"
AI_RATE_LIMIT_WINDOW_MS="600000"
AI_MAX_CODE_CHARS="2000"
AI_MAX_CONTEXT_CHARS="1500"
AI_MAX_OUTPUT_TOKENS="900"
AI_REASONING_EFFORT="minimal"
```

### Local Piston Execution

```bash
CODE_EXECUTION_PROVIDER="piston"
PISTON_API_URL="https://emkc.org/api/v2/piston"
PISTON_API_KEY=""
PISTON_JAVASCRIPT_VERSION="18.15.0"
PISTON_TYPESCRIPT_VERSION="5.0.3"
PISTON_PYTHON_VERSION="3.10.0"
```

For self-hosted local Piston:

```bash
docker run --privileged -v /tmp/piston:/piston -dit -p 2000:2000 --name piston_api ghcr.io/engineer-man/piston
curl -X POST http://localhost:2000/api/v2/packages -H "Content-Type: application/json" -d '{"language":"node","version":"18.15.0"}'
curl -X POST http://localhost:2000/api/v2/packages -H "Content-Type: application/json" -d '{"language":"typescript","version":"5.0.3"}'
curl -X POST http://localhost:2000/api/v2/packages -H "Content-Type: application/json" -d '{"language":"python","version":"3.10.0"}'
```

Then set:

```bash
PISTON_API_URL="http://localhost:2000/api/v2"
```

### Production Judge0 Execution

```bash
CODE_EXECUTION_PROVIDER="judge0"
JUDGE0_API_URL="https://judge0-ce.p.rapidapi.com"
JUDGE0_API_KEY="your-rapidapi-key"
JUDGE0_API_HOST="judge0-ce.p.rapidapi.com"
JUDGE0_MONTHLY_EXECUTION_LIMIT="1500"
EXECUTION_RATE_LIMIT_MAX="20"
EXECUTION_RATE_LIMIT_WINDOW_MS="3600000"
EXECUTION_DAILY_RATE_LIMIT_MAX="100"
EXECUTION_DAILY_RATE_LIMIT_WINDOW_MS="86400000"
```

Judge0 usage is reserved immediately before submission. If the provider rejects after that point, the app keeps the count conservative and does not retry automatically.

## Testing

Run all tests:

```bash
npm test
```

Run one side:

```bash
npm run test:backend
npm run test:frontend
```

Run type checks:

```bash
npm run typecheck
```

Run coverage:

```bash
npm run test:coverage
```

Test coverage includes:

- workspace state logic
- workspace rename validation and broadcast behavior
- filename validation
- language detection
- collaborator presence state
- Express health route
- Socket.io collaboration flows
- file sidebar, file dialog, and delete confirmation behavior
- recent workspace history
- AI route validation, rate limiting, and provider failure handling
- AI panel loading/error/limit/replacement states
- execution validation, output truncation, provider failure, and rate limiting
- Piston and Judge0 execution provider behavior
- lower panel, terminal, and execution UI behavior

## Manual Verification

### Multi-User Collaboration

1. Open the live demo or local frontend.
2. Create a workspace.
3. Copy the workspace URL with Share.
4. Open the same URL in another browser tab.
5. Confirm collaborators appear in both tabs.
6. Create, rename, delete, and switch files.
7. Confirm edits synchronize only between tabs on the same workspace URL.
8. Move the text caret and confirm remote cursor decorations appear.
9. Click a collaborator and confirm the editor jumps to their file and cursor.
10. Click Leave Workspace and confirm only live presence is removed.

### Persistence

1. Set `DATABASE_URL`.
2. Create a workspace.
3. Rename the workspace.
4. Add or rename files.
5. Edit file contents.
6. Wait for persistence or stop the backend gracefully.
7. Restart the backend.
8. Reopen the same `/workspace/{workspaceId}` URL.
9. Confirm workspace name, files, languages, and contents are restored.
10. Confirm collaborators and cursors reset after restart.

### AI

1. Select code in Monaco.
2. Open Ask AI.
3. Run Explain, Refactor, Fix Bug, Generate Tests, or Optimize.
4. Confirm the result is shown for review.
5. Confirm code is not inserted automatically.
6. Click Replace Selection for a replacement response.
7. Confirm the edit syncs through normal Socket.io code-change flow.

### Code Execution

1. Open a JavaScript, TypeScript, or Python file.
2. Click Run Code or press `Ctrl+Enter` / `Cmd+Enter`.
3. Confirm Output shows the result.
4. Add standard input in the Input tab and run again.
5. Open the same workspace in another tab and confirm output remains local.
6. Try an unsupported file type and confirm a friendly error appears.

## Current Policies And Tradeoffs

- No authentication or permissions yet.
- Workspace IDs are permanent identifiers; workspace names are display-only.
- Unknown persisted workspace URLs show a friendly not-found/expired state.
- A workspace must always contain at least one file.
- Disconnected editing is paused instead of stored offline.
- Concurrent editing uses last-write-wins, not CRDT or operational transform.
- Presence, cursors, terminal history, and execution output are ephemeral.
- Recent workspace history is browser-local and stores metadata only.
- AI requests are stateless and not persisted.
- AI can only operate on the current Monaco selection.
- Code execution is limited to JavaScript, TypeScript, and Python.
- Run output is local to the requesting browser tab.

## Security Notes

- AI keys, database credentials, and execution-provider secrets stay backend-only.
- Raw provider errors and secrets are not returned to the frontend.
- AI Markdown is rendered with raw HTML disabled.
- AI replacement requires explicit user action.
- Submitted execution filenames are validated.
- Execution requests are rate limited.
- Judge0 usage is capped globally per calendar month in PostgreSQL.
- Collaborator identity is temporary and anonymous.

## Future Work

- Authentication and user-owned workspaces
- Workspace permissions and invite controls
- Stronger conflict handling with CRDT or operational transform
- Folder tree support
- More complete multi-file execution support
- Persistent terminal sessions
- Richer collaborator awareness
- Production observability and admin tooling
