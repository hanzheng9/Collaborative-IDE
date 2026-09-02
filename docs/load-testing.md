# Collaboration Load Testing

This repository includes a standalone Socket.io load test for the real-time
collaboration layer. It connects simulated users to one workspace, joins using
the normal `join-workspace` event, and sends normal `code-change` events at a
controlled typing-like pace.

The load test does not call AI endpoints, code execution endpoints, or manual
version-history APIs.

## Disposable Workspace

Use a disposable workspace ID so generated load-test content can be ignored or
deleted later:

```bash
WORKSPACE_ID=load-test-demo
```

If the workspace does not exist, the load test creates it by sending
`createIfMissing: true` during `join-workspace`.

## Local Backend

Start the backend first:

```bash
npm run dev:backend
```

Then run a small test:

```bash
npm run load-test -- --clients=10 --duration=60 --workspace-id=load-test-demo
```

## Production Backend

Point the test at the deployed backend with `BACKEND_URL` or `--backend-url`.
Increase traffic gradually.

```bash
BACKEND_URL=https://your-railway-backend.example \
npm run load-test -- --clients=10 --duration=60 --workspace-id=load-test-demo
```

## Common Test Stages

```bash
npm run load-test -- --clients=10 --duration=60 --workspace-id=load-test-demo
npm run load-test -- --clients=25 --duration=60 --workspace-id=load-test-demo
npm run load-test -- --clients=50 --duration=60 --workspace-id=load-test-demo
npm run load-test -- --clients=100 --duration=60 --workspace-id=load-test-demo
```

## Options

- `--clients=50`: number of simulated collaborators
- `--duration=60`: test duration in seconds
- `--backend-url=http://localhost:4000`: backend URL
- `--workspace-id=load-test-demo`: workspace to join
- `--file-id=main.ts`: specific file to edit
- `--interval-min-ms=1000`: minimum delay between edits per client
- `--interval-max-ms=2000`: maximum delay between edits per client
- `--max-clients=150`: safety cap for requested clients
- `--create-if-missing=true`: create the workspace if it does not exist

Environment variables are also supported for `BACKEND_URL`, `WORKSPACE_ID`,
`FILE_ID`, `CLIENTS`, and `DURATION`.

## Interpreting Latency

The current production Socket.io protocol does not acknowledge `code-change`
events, and the sender does not receive its own broadcast. To avoid changing
production behavior, the load test embeds a unique marker in each normal code
change and measures the time until another simulated client observes that marker.

- `p50`: half of observed broadcasts were this fast or faster
- `p95`: 95% of observed broadcasts were this fast or faster
- `p99`: 99% of observed broadcasts were this fast or faster
- `Max`: slowest observed broadcast

`Events successful` means the client emitted a valid `code-change` event.
`Events observed` means at least one other simulated client received the matching
broadcast. Do not claim delivery for timed-out events.

## Persistence Note

The test uses normal collaboration edits, so the backend may debounce and persist
the generated file content to PostgreSQL. Use a disposable workspace/file for
production tests.
