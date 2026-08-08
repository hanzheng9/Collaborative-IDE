import { createServer } from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import {
  closeDatabase,
  createWorkspace,
  deleteExpiredWorkspaces,
  deleteFile,
  isDatabaseConfigured,
  loadWorkspace,
  migrateDatabase,
  renameFile,
  saveFile,
  saveFileContent,
  touchWorkspace
} from "./database.js";
import { ExecutionService } from "./execution/executionService.js";
import { logger } from "./logger.js";
import { WorkspaceService, type WorkspacePersistence } from "./services/workspaceService.js";
import { registerSocketHandlers } from "./socketHandlers.js";
import type { ClientToServerEvents, ServerToClientEvents } from "./types.js";

export async function startServer() {
  const config = loadConfig();
  const persistence: WorkspacePersistence = {
    async loadWorkspace(workspaceId) {
      const workspace = await loadWorkspace(workspaceId);

      if (!isDatabaseConfigured()) {
        return undefined;
      }

      return workspace?.files ?? null;
    },
    async createWorkspace(workspaceId, files) {
      await createWorkspace(workspaceId, "Untitled Workspace", files);
    },
    deleteFile,
    renameFile,
    saveFile,
    saveFileContent,
    touchWorkspace
  };
  const workspaceService = new WorkspaceService({ persistence });
  const executionService = new ExecutionService({ workspaceService });
  const app = createApp({ executionService });
  const server = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: {
      origin: config.corsOrigin,
      methods: ["GET", "POST"]
    }
  });

  let persistenceAvailable = isDatabaseConfigured();

  try {
    await migrateDatabase();
  } catch (error) {
    persistenceAvailable = false;
    logger.error("database unavailable", {
      error: error instanceof Error ? error.message : "unknown",
      persistenceEnabled: false
    });
  }

  const { flushPendingWrites, workspaceService: registeredWorkspaceService } = registerSocketHandlers(io, {
    workspaceService
  });

  const cleanupRetentionDays = Number(
    process.env.WORKSPACE_RETENTION_DAYS ?? 30
  );
  const cleanupIntervalHours = Number(
    process.env.WORKSPACE_CLEANUP_INTERVAL_HOURS ?? 24
  );
  let workspaceCleanupTimer: ReturnType<typeof setInterval> | null = null;

  const runWorkspaceCleanup = async () => {
    if (!isDatabaseConfigured()) {
      return;
    }

    try {
      await deleteExpiredWorkspaces({
        excludeWorkspaceIds: registeredWorkspaceService.getLoadedWorkspaceIds(),
        retentionDays: cleanupRetentionDays
      });
    } catch (error) {
      logger.error("expired workspace cleanup failed", {
        error: error instanceof Error ? error.message : "unknown"
      });
    }
  };

  void runWorkspaceCleanup();

  if (cleanupIntervalHours > 0) {
    workspaceCleanupTimer = setInterval(
      () => {
        void runWorkspaceCleanup();
      },
      cleanupIntervalHours * 60 * 60 * 1000
    );
  }

  server.listen(config.port, () => {
    logger.info("backend listening", {
      codeExecution: executionService.isConfigured() ? "enabled" : "disabled",
      postgreSQLPersistence: persistenceAvailable ? "enabled" : "disabled",
      port: config.port
    });
  });

  async function shutdown(signal: string) {
    logger.info("shutdown started", { signal });
    if (workspaceCleanupTimer) {
      clearInterval(workspaceCleanupTimer);
    }
    await flushPendingWrites();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeDatabase();
    logger.info("shutdown complete", { signal });
  }

  return {
    io,
    server,
    shutdown
  };
}
