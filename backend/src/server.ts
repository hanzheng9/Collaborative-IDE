import { createServer } from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import {
  closeDatabase,
  createWorkspace,
  deleteFile,
  isDatabaseConfigured,
  loadWorkspace,
  migrateDatabase,
  renameFile,
  saveFile,
  saveFileContent
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
      return (await loadWorkspace(workspaceId))?.files ?? null;
    },
    async createWorkspace(workspaceId, files) {
      await createWorkspace(workspaceId, workspaceId, files);
    },
    deleteFile,
    renameFile,
    saveFile,
    saveFileContent
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

  const { flushPendingWrites } = registerSocketHandlers(io, {
    workspaceService
  });

  server.listen(config.port, () => {
    logger.info("backend listening", {
      codeExecution: executionService.isConfigured() ? "enabled" : "disabled",
      postgreSQLPersistence: persistenceAvailable ? "enabled" : "disabled",
      port: config.port
    });
  });

  async function shutdown(signal: string) {
    logger.info("shutdown started", { signal });
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
