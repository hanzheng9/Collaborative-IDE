import { createServer } from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import {
  createWorkspace,
  isDatabaseConfigured,
  loadWorkspace,
  migrateDatabase,
  renameFile,
  saveFile,
  saveFileContent
} from "./database.js";
import { registerSocketHandlers } from "./socketHandlers.js";

const app = createApp();
const server = createServer(app);
const port = Number(process.env.PORT ?? 4000);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});
const databaseReady = migrateDatabase().catch((error) => {
  console.error("Failed to initialize PostgreSQL schema:", error);
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

server.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
  console.log(
    isDatabaseConfigured()
      ? "PostgreSQL persistence enabled."
      : "PostgreSQL persistence disabled. Set DATABASE_URL to enable it."
  );
});

process.on("SIGINT", () => {
  void flushPendingWrites().finally(() => {
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  void flushPendingWrites().finally(() => {
    process.exit(0);
  });
});
