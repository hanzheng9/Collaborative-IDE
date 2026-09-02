import { io, type Socket } from "socket.io-client";
import type {
  AppErrorPayload,
  ClientToServerEvents,
  CodeChangePayload,
  ServerToClientEvents,
  WorkspaceStatePayload
} from "@collaborative-ide/shared";
import { summarizeLatencies } from "./metrics";

type CollaborativeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type Options = {
  backendUrl: string;
  clients: number;
  createIfMissing: boolean;
  durationSeconds: number;
  fileId?: string;
  intervalMaxMs: number;
  intervalMinMs: number;
  maxClients: number;
  observeTimeoutMs: number;
  workspaceId: string;
};

type SimulatedClient = {
  index: number;
  socket: CollaborativeSocket;
};

type PendingEvent = {
  marker: string;
  sentAt: number;
  senderId: string;
  timedOut: boolean;
};

type Counters = {
  errors: number;
  eventsAttempted: number;
  eventsObserved: number;
  eventsSuccessful: number;
  failedConnections: number;
  reconnectAttempts: number;
  timeouts: number;
  unexpectedDisconnects: number;
};

function getArg(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));

  return match?.slice(prefix.length);
}

function getNumberArg(name: string, fallback: number) {
  const value = getArg(name);

  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive number.`);
  }

  return parsed;
}

function getBooleanArg(name: string, fallback: boolean) {
  const value = getArg(name);

  if (!value) {
    return fallback;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`--${name} must be true or false.`);
}

function getOptions(): Options {
  const maxClients = getNumberArg("max-clients", 150);
  const clients = getNumberArg("clients", Number(process.env.CLIENTS ?? 10));

  if (clients > maxClients) {
    throw new Error(
      `Refusing to start ${clients} clients. Increase --max-clients intentionally if needed.`
    );
  }

  const intervalMinMs = getNumberArg("interval-min-ms", 1000);
  const intervalMaxMs = getNumberArg("interval-max-ms", 2000);

  if (intervalMaxMs < intervalMinMs) {
    throw new Error("--interval-max-ms must be greater than or equal to --interval-min-ms.");
  }

  return {
    backendUrl:
      getArg("backend-url") ?? process.env.BACKEND_URL ?? "http://localhost:4000",
    clients,
    createIfMissing: getBooleanArg("create-if-missing", true),
    durationSeconds: getNumberArg("duration", Number(process.env.DURATION ?? 60)),
    fileId: getArg("file-id") ?? process.env.FILE_ID,
    intervalMaxMs,
    intervalMinMs,
    maxClients,
    observeTimeoutMs: getNumberArg("observe-timeout-ms", 5000),
    workspaceId:
      getArg("workspace-id") ??
      process.env.WORKSPACE_ID ??
      `load-test-${Date.now()}`
  };
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function jitter(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function getMarker(code: string) {
  return code.match(/collaborative-ide-load-test:([a-zA-Z0-9-]+)/)?.[1];
}

function createCode(marker: string, clientIndex: number, eventIndex: number) {
  return [
    `// collaborative-ide-load-test:${marker}`,
    `// client ${clientIndex}, event ${eventIndex}`,
    `export const loadTestMarker = "${marker}";`
  ].join("\n");
}

async function connectClient(
  index: number,
  options: Options,
  counters: Counters,
  onCodeChange: (payload: CodeChangePayload, observerId: string) => void
) {
  return new Promise<{
    client: SimulatedClient | null;
    workspaceState: WorkspaceStatePayload | null;
  }>((resolve) => {
    const socket: CollaborativeSocket = io(options.backendUrl, {
      reconnection: true,
      timeout: 8000
    });
    let settled = false;

    const finish = (
      client: SimulatedClient | null,
      workspaceState: WorkspaceStatePayload | null
    ) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve({ client, workspaceState });
    };

    const timeout = setTimeout(() => {
      counters.failedConnections += 1;
      socket.disconnect();
      finish(null, null);
    }, 12000);

    socket.io.on("reconnect_attempt", () => {
      counters.reconnectAttempts += 1;
    });

    socket.on("connect", () => {
      socket.emit("join-workspace", {
        createIfMissing: options.createIfMissing,
        workspaceId: options.workspaceId
      });
    });

    socket.on("workspace-state", (payload) => {
      if (payload.workspaceId !== options.workspaceId) {
        return;
      }

      finish({ index, socket }, payload);
    });

    socket.on("workspace-error", (payload: AppErrorPayload) => {
      counters.errors += 1;
      counters.failedConnections += 1;
      console.error(
        `client ${index} workspace error: ${payload.code} ${payload.message}`
      );
      socket.disconnect();
      finish(null, null);
    });

    socket.on("file-operation-error", (payload: AppErrorPayload) => {
      counters.errors += 1;
      console.error(
        `client ${index} socket error: ${payload.code} ${payload.message}`
      );
    });

    socket.on("code-change", (payload) => {
      onCodeChange(payload, socket.id ?? "");
    });

    socket.on("connect_error", (error) => {
      counters.errors += 1;
      console.error(`client ${index} connection error: ${error.message}`);
    });

    socket.on("disconnect", (reason) => {
      if (!settled || reason === "io client disconnect") {
        return;
      }

      counters.unexpectedDisconnects += 1;
    });
  });
}

function printSummary(
  options: Options,
  connectedClients: number,
  counters: Counters,
  latencies: number[]
) {
  const latencySummary = summarizeLatencies(latencies);
  const successPercent =
    options.clients === 0
      ? 0
      : Math.round((connectedClients / options.clients) * 10000) / 100;

  console.log("");
  console.log("========================================");
  console.log("Collaborative IDE Load Test");
  console.log("========================================");
  console.log("");
  console.log(`Backend:                  ${options.backendUrl}`);
  console.log(`Workspace:                ${options.workspaceId}`);
  console.log("");
  console.log(`Duration:                 ${options.durationSeconds}s`);
  console.log(`Requested clients:        ${options.clients}`);
  console.log(`Connected clients:        ${connectedClients}`);
  console.log(`Failed connections:       ${counters.failedConnections}`);
  console.log(`Connection success:       ${successPercent}%`);
  console.log("");
  console.log(`Events attempted:         ${counters.eventsAttempted}`);
  console.log(`Events successful:        ${counters.eventsSuccessful}`);
  console.log(`Events observed:          ${counters.eventsObserved}`);
  console.log(`Event errors:             ${counters.errors}`);
  console.log(`Event timeouts:           ${counters.timeouts}`);
  console.log(`Unexpected disconnects:   ${counters.unexpectedDisconnects}`);
  console.log(`Reconnect attempts:       ${counters.reconnectAttempts}`);
  console.log("");
  console.log("Synchronization latency");
  console.log(`Average:                  ${latencySummary.average} ms`);
  console.log(`p50:                      ${latencySummary.p50} ms`);
  console.log(`p95:                      ${latencySummary.p95} ms`);
  console.log(`p99:                      ${latencySummary.p99} ms`);
  console.log(`Max:                      ${latencySummary.max} ms`);
  console.log("");
  console.log("========================================");
}

async function main() {
  const options = getOptions();
  const counters: Counters = {
    errors: 0,
    eventsAttempted: 0,
    eventsObserved: 0,
    eventsSuccessful: 0,
    failedConnections: 0,
    reconnectAttempts: 0,
    timeouts: 0,
    unexpectedDisconnects: 0
  };
  const clients: SimulatedClient[] = [];
  const timers = new Set<NodeJS.Timeout>();
  const pendingEvents = new Map<string, PendingEvent>();
  const latencies: number[] = [];
  let targetFileId = options.fileId;
  let isStopping = false;

  const cleanup = () => {
    isStopping = true;
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers.clear();

    for (const client of clients) {
      client.socket.disconnect();
    }
  };

  const handleSignal = () => {
    cleanup();
    printSummary(options, clients.length, counters, latencies);
    process.exitCode = 130;
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  const onCodeChange = (payload: CodeChangePayload, observerId: string) => {
    if (
      payload.workspaceId !== options.workspaceId ||
      payload.fileId !== targetFileId
    ) {
      return;
    }

    const marker = getMarker(payload.code);

    if (!marker) {
      return;
    }

    const pendingEvent = pendingEvents.get(marker);

    if (!pendingEvent || pendingEvent.senderId === observerId) {
      return;
    }

    counters.eventsObserved += 1;
    latencies.push(Date.now() - pendingEvent.sentAt);
    pendingEvents.delete(marker);
  };

  console.log(
    `Connecting ${options.clients} clients to ${options.backendUrl} workspace ${options.workspaceId}...`
  );

  const connectionResults = await Promise.all(
    Array.from({ length: options.clients }, (_value, index) =>
      connectClient(index + 1, options, counters, onCodeChange)
    )
  );

  for (const result of connectionResults) {
    if (result.client) {
      clients.push(result.client);
    }

    if (!targetFileId && result.workspaceState?.files[0]) {
      targetFileId = result.workspaceState.files[0].fileId;
    }
  }

  if (!targetFileId) {
    cleanup();
    throw new Error("No file was available to edit in the workspace.");
  }

  const firstState = connectionResults.find((result) => result.workspaceState)
    ?.workspaceState;
  const targetFileExists = firstState?.files.some(
    (file) => file.fileId === targetFileId
  );

  if (!targetFileExists) {
    cleanup();
    throw new Error(`File ${targetFileId} does not exist in ${options.workspaceId}.`);
  }

  for (const client of clients) {
    client.socket.emit("file-selected", {
      fileId: targetFileId,
      workspaceId: options.workspaceId
    });
  }

  if (clients.length < 2) {
    console.warn(
      "At least two connected clients are needed to observe broadcast latency."
    );
  }

  let eventIndex = 0;
  const startedAt = Date.now();
  const stopAt = startedAt + options.durationSeconds * 1000;

  const scheduleClientEdit = (client: SimulatedClient) => {
    const timer = setTimeout(() => {
      timers.delete(timer);

      if (isStopping || Date.now() >= stopAt) {
        return;
      }

      counters.eventsAttempted += 1;

      if (!client.socket.connected || !targetFileId) {
        counters.errors += 1;
        scheduleClientEdit(client);
        return;
      }

      eventIndex += 1;
      const marker = `${client.index}-${eventIndex}-${Date.now()}`;
      const code = createCode(marker, client.index, eventIndex);

      pendingEvents.set(marker, {
        marker,
        senderId: client.socket.id ?? "",
        sentAt: Date.now(),
        timedOut: false
      });
      client.socket.emit("code-change", {
        code,
        fileId: targetFileId,
        workspaceId: options.workspaceId
      });
      counters.eventsSuccessful += 1;
      scheduleClientEdit(client);
    }, jitter(options.intervalMinMs, options.intervalMaxMs));

    timers.add(timer);
  };

  const timeoutSweep = setInterval(() => {
    const now = Date.now();

    for (const [marker, pendingEvent] of pendingEvents) {
      if (
        !pendingEvent.timedOut &&
        now - pendingEvent.sentAt > options.observeTimeoutMs
      ) {
        pendingEvent.timedOut = true;
        counters.timeouts += 1;
        pendingEvents.delete(marker);
      }
    }
  }, 1000);
  timers.add(timeoutSweep);

  for (const client of clients) {
    scheduleClientEdit(client);
  }

  await wait(options.durationSeconds * 1000);
  cleanup();
  printSummary(options, clients.length, counters, latencies);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
