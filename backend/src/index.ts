import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Server } from "socket.io";

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
let userCount = 0;

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

app.use(cors());
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

io.on("connection", (socket) => {
  socket.on("join-workspace", ({ workspaceId }: JoinWorkspacePayload) => {
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
    const file = createWorkspaceFile(payload);

    // Server creates the file ID, then broadcasts to every tab including the
    // creator so all clients converge on the same workspace structure.
    io.to(payload.workspaceId).emit("file-created", {
      workspaceId: payload.workspaceId,
      file,
      createdBy: socket.id
    });
  });

  socket.on("rename-file", (payload: RenameFilePayload) => {
    const file = renameWorkspaceFile(payload);

    if (!file) {
      return;
    }

    io.to(payload.workspaceId).emit("file-renamed", {
      workspaceId: payload.workspaceId,
      file
    });
  });

  socket.on("file-selected", ({ workspaceId, fileId }: FileSelectedPayload) => {
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
    const collaborator = getCollaborators(payload.workspaceId).get(socket.id);

    if (!collaborator) {
      return;
    }

    collaborator.currentFileId = payload.fileId;
    collaborator.cursorPosition = payload.cursorPosition;
    broadcastCollaborators(payload.workspaceId);
  });

  socket.on("code-change", (payload: CodeChangePayload) => {
    const file = updateWorkspaceFile(payload);

    if (!file) {
      return;
    }

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
});
