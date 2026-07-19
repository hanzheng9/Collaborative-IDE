import { createServer } from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import {
  closeDatabase,
  createWorkspace,
  isDatabaseConfigured,
  loadWorkspace,
  migrateDatabase,
  renameFile,
  saveFile,
  saveFileContent
} from "./database.js";
import { logger } from "./logger.js";
import { registerSocketHandlers } from "./socketHandlers.js";
import type { ClientToServerEvents, ServerToClientEvents } from "./types.js";

export function startServer() {
  const config = loadConfig();
  const app = createApp();
  const server = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: {
      origin: config.corsOrigin,
      methods: ["GET", "POST"]
    }
  });
  const databaseReady = migrateDatabase().catch((error) => {
    logger.error("database schema initialization failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
  });
  const { flushPendingWrites } = registerSocketHandlers(io, {
    persistence: {
      async loadWorkspace(workspaceId) {
        await databaseReady;
        return (await loadWorkspace(workspaceId))?.files ?? null;
      },
      async createWorkspace(workspaceId, files) {
        await createWorkspace(workspaceId, workspaceId, files);
      },
      renameFile,
      saveFile,
      saveFileContent
    }
  });

  server.listen(config.port, () => {
    logger.info("backend listening", {
      databaseConfigured: isDatabaseConfigured(),
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
