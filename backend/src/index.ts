import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  createWorkspace,
  isDatabaseConfigured,
  loadWorkspace,
  migrateDatabase,
  renameFile,
  saveFile,
  saveFileContent
} from "./database.js";

type CodeChangePayload = {
  workspaceId: string;
  fileId: string;
  code: string;
};

type JoinWorkspacePayload = {
  workspaceId: string;
};

type CreateFilePayload = {
  workspaceId: string;
  fileName: string;
};

type RenameFilePayload = {
  workspaceId: string;
  fileId: string;
  fileName: string;
};

type FileSelectedPayload = {
  workspaceId: string;
  fileId: string;
};

type CursorPosition = {
  lineNumber: number;
  column: number;
};

type CursorChangePayload = {
  workspaceId: string;
  fileId: string;
  cursorPosition: CursorPosition;
};

type WorkspaceFile = {
  fileId: string;
  fileName: string;
  language: string;
  content: string;
};

type Collaborator = {
  userId: string;
  displayName: string;
  color: string;
  currentFileId: string;
  cursorPosition: CursorPosition | null;
};

type WorkspaceState = {
  workspaceId: string;
  files: WorkspaceFile[];
};

const defaultCode = `function greet(name: string) {
  return \`Hello, \${name}!\`;
}

console.log(greet("Collaborative IDE"));
`;

const app = express();
const server = createServer(app);
const port = Number(process.env.PORT ?? 4000);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});
const workspaces = new Map<string, Map<string, WorkspaceFile>>();
const collaborators = new Map<string, Map<string, Collaborator>>();
const socketWorkspaces = new Map<string, string>();
const workspaceLoadPromises = new Map<string, Promise<Map<string, WorkspaceFile>>>();
const pendingContentWrites = new Map<string, NodeJS.Timeout>();
let userCount = 0;
const contentWriteDelayMs = 800;
const databaseReady = migrateDatabase().catch((error) => {
  console.error("Failed to initialize PostgreSQL schema:", error);
});

const collaboratorColors = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899"
];

function getLanguageForFile(fileName: string) {
  if (fileName.endsWith(".ts") || fileName.endsWith(".tsx")) {
    return "typescript";
  }

  if (fileName.endsWith(".js") || fileName.endsWith(".jsx")) {
    return "javascript";
  }

  if (fileName.endsWith(".json")) {
    return "json";
  }

  if (fileName.endsWith(".css")) {
    return "css";
  }

  if (fileName.endsWith(".html")) {
    return "html";
  }

  if (fileName.endsWith(".md")) {
    return "markdown";
  }

  return "plaintext";
}

function createDefaultWorkspace() {
  return new Map<string, WorkspaceFile>([
    [
      "main.ts",
      {
        fileId: "main.ts",
        fileName: "main.ts",
        language: "typescript",
        content: defaultCode
      }
    ]
  ]);
}

function isValidId(value: string) {
  return typeof value === "string" && value.trim().length > 0;
}

function toWorkspaceFileMap(files: WorkspaceFile[]) {
  return new Map(files.map((file) => [file.fileId, file]));
}

async function loadWorkspaceIntoMemory(workspaceId: string) {
  if (!isValidId(workspaceId)) {
    throw new Error("Invalid workspaceId");
  }

  const existingFiles = workspaces.get(workspaceId);

  if (existingFiles) {
    return existingFiles;
  }

  const existingLoad = workspaceLoadPromises.get(workspaceId);

  if (existingLoad) {
    return existingLoad;
  }

  const loadPromise = (async () => {
    try {
      await databaseReady;
      const persistedWorkspace = await loadWorkspace(workspaceId);

      if (persistedWorkspace && persistedWorkspace.files.length > 0) {
        const files = toWorkspaceFileMap(persistedWorkspace.files);
        workspaces.set(workspaceId, files);
        return files;
      }

      const files = createDefaultWorkspace();
      workspaces.set(workspaceId, files);

      await createWorkspace(workspaceId, workspaceId, Array.from(files.values()));

      return files;
    } catch (error) {
      console.error("Failed to load workspace from PostgreSQL:", error);

      const files = createDefaultWorkspace();
      workspaces.set(workspaceId, files);

      return files;
    } finally {
      workspaceLoadPromises.delete(workspaceId);
    }
  })();

  workspaceLoadPromises.set(workspaceId, loadPromise);

  return loadPromise;
}

function getWorkspaceFiles(workspaceId: string) {
  let files = workspaces.get(workspaceId);

  if (!files) {
    files = createDefaultWorkspace();
    workspaces.set(workspaceId, files);
  }

  return files;
}

function getWorkspaceState(workspaceId: string): WorkspaceState {
  return {
    workspaceId,
    files: Array.from(getWorkspaceFiles(workspaceId).values())
  };
}

function getCollaborators(workspaceId: string) {
  let workspaceCollaborators = collaborators.get(workspaceId);

  if (!workspaceCollaborators) {
    workspaceCollaborators = new Map<string, Collaborator>();
    collaborators.set(workspaceId, workspaceCollaborators);
  }

  return workspaceCollaborators;
}

function getCollaboratorState(workspaceId: string) {
  return {
    workspaceId,
    collaborators: Array.from(getCollaborators(workspaceId).values())
  };
}

function broadcastCollaborators(workspaceId: string) {
  io.to(workspaceId).emit("collaborators-state", getCollaboratorState(workspaceId));
}

function createCollaborator(workspaceId: string, userId: string): Collaborator {
  const files = Array.from(getWorkspaceFiles(workspaceId).values());
  userCount += 1;

  return {
    userId,
    displayName: `User ${userCount}`,
    color: collaboratorColors[Math.floor(Math.random() * collaboratorColors.length)],
    currentFileId: files[0]?.fileId ?? "main.ts",
    cursorPosition: null
  };
}

function createWorkspaceFile({ workspaceId, fileName }: CreateFilePayload) {
  const files = getWorkspaceFiles(workspaceId);
  const fileId = randomUUID();
  const normalizedFileName = fileName.trim() || "untitled.ts";
  const file: WorkspaceFile = {
    fileId,
    fileName: normalizedFileName,
    language: getLanguageForFile(normalizedFileName),
    content: ""
  };

  files.set(fileId, file);

  return file;
}

function renameWorkspaceFile({ workspaceId, fileId, fileName }: RenameFilePayload) {
  const file = getWorkspaceFiles(workspaceId).get(fileId);

  if (!file) {
    return null;
  }

  file.fileName = fileName.trim() || file.fileName;
  file.language = getLanguageForFile(file.fileName);

  return file;
}

function updateWorkspaceFile({ workspaceId, fileId, code }: CodeChangePayload) {
  const file = getWorkspaceFiles(workspaceId).get(fileId);

  if (!file) {
    return null;
  }

  file.content = code;

  return file;
}

function getWriteKey(workspaceId: string, fileId: string) {
  return `${workspaceId}:${fileId}`;
}

function scheduleContentSave(workspaceId: string, fileId: string) {
  const writeKey = getWriteKey(workspaceId, fileId);
  const pendingWrite = pendingContentWrites.get(writeKey);

  if (pendingWrite) {
    clearTimeout(pendingWrite);
  }

  pendingContentWrites.set(
    writeKey,
    setTimeout(() => {
      void flushContentSave(workspaceId, fileId);
    }, contentWriteDelayMs)
  );
}

async function flushContentSave(workspaceId: string, fileId: string) {
  const writeKey = getWriteKey(workspaceId, fileId);
  pendingContentWrites.delete(writeKey);

  const file = workspaces.get(workspaceId)?.get(fileId);

  if (!file) {
    return;
  }

  try {
    // Read from memory at flush time so a delayed database write cannot save
    // older content over a newer real-time edit.
    await saveFileContent(workspaceId, fileId, file.content);
  } catch (error) {
    console.error("Failed to persist file content:", error);
    scheduleContentSave(workspaceId, fileId);
  }
}

async function flushPendingWrites() {
  const pendingWrites = Array.from(pendingContentWrites.keys()).map((writeKey) => {
    const [workspaceId, fileId] = writeKey.split(":");
    const pendingWrite = pendingContentWrites.get(writeKey);

    if (pendingWrite) {
      clearTimeout(pendingWrite);
    }

    return flushContentSave(workspaceId, fileId);
  });

  await Promise.allSettled(pendingWrites);
}

app.use(cors());
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

io.on("connection", (socket) => {
  socket.on("join-workspace", async ({ workspaceId }: JoinWorkspacePayload) => {
    if (!isValidId(workspaceId)) {
      socket.emit("workspace-error", { message: "Invalid workspaceId" });
      return;
    }

    await loadWorkspaceIntoMemory(workspaceId);

    socket.join(workspaceId);
    socketWorkspaces.set(socket.id, workspaceId);

    const workspaceCollaborators = getCollaborators(workspaceId);
    workspaceCollaborators.set(
      socket.id,
      createCollaborator(workspaceId, socket.id)
    );

    // Join sync: every tab receives the full in-memory workspace snapshot so
    // late joiners get all file names and contents before editing.
    socket.emit("workspace-state", getWorkspaceState(workspaceId));
    broadcastCollaborators(workspaceId);
  });

  socket.on("create-file", (payload: CreateFilePayload) => {
    if (!isValidId(payload.workspaceId) || !isValidId(payload.fileName)) {
      return;
    }

    const file = createWorkspaceFile(payload);

    void saveFile(payload.workspaceId, file).catch((error) => {
      console.error("Failed to persist created file:", error);
    });

    // Server creates the file ID, then broadcasts to every tab including the
    // creator so all clients converge on the same workspace structure.
    io.to(payload.workspaceId).emit("file-created", {
      workspaceId: payload.workspaceId,
      file,
      createdBy: socket.id
    });
  });

  socket.on("rename-file", (payload: RenameFilePayload) => {
    if (
      !isValidId(payload.workspaceId) ||
      !isValidId(payload.fileId) ||
      !isValidId(payload.fileName)
    ) {
      return;
    }

    const file = renameWorkspaceFile(payload);

    if (!file) {
      return;
    }

    void renameFile(
      payload.workspaceId,
      payload.fileId,
      file.fileName,
      file.language
    ).catch((error) => {
      console.error("Failed to persist renamed file:", error);
    });

    io.to(payload.workspaceId).emit("file-renamed", {
      workspaceId: payload.workspaceId,
      file
    });
  });

  socket.on("file-selected", ({ workspaceId, fileId }: FileSelectedPayload) => {
    if (!isValidId(workspaceId) || !isValidId(fileId)) {
      return;
    }

    const collaborator = getCollaborators(workspaceId).get(socket.id);

    if (!collaborator) {
      return;
    }

    // Awareness sync: file selection is presence metadata, separate from code.
    collaborator.currentFileId = fileId;
    collaborator.cursorPosition = null;
    broadcastCollaborators(workspaceId);
  });

  socket.on("cursor-change", (payload: CursorChangePayload) => {
    if (!isValidId(payload.workspaceId) || !isValidId(payload.fileId)) {
      return;
    }

    const collaborator = getCollaborators(payload.workspaceId).get(socket.id);

    if (!collaborator) {
      return;
    }

    collaborator.currentFileId = payload.fileId;
    collaborator.cursorPosition = payload.cursorPosition;
    broadcastCollaborators(payload.workspaceId);
  });

  socket.on("code-change", (payload: CodeChangePayload) => {
    if (!isValidId(payload.workspaceId) || !isValidId(payload.fileId)) {
      return;
    }

    const file = updateWorkspaceFile(payload);

    if (!file) {
      return;
    }

    scheduleContentSave(payload.workspaceId, payload.fileId);

    // Edit sync: save the selected file's new content, then broadcast only to
    // other tabs in the room. Switching files never mutates unrelated files.
    socket.to(payload.workspaceId).emit("code-change", {
      workspaceId: payload.workspaceId,
      fileId: payload.fileId,
      code: file.content
    });
  });

  socket.on("disconnect", () => {
    const workspaceId = socketWorkspaces.get(socket.id);

    if (!workspaceId) {
      return;
    }

    getCollaborators(workspaceId).delete(socket.id);
    socketWorkspaces.delete(socket.id);
    broadcastCollaborators(workspaceId);
  });
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
