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

type WorkspaceFile = {
  fileId: string;
  fileName: string;
  language: string;
  content: string;
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

    // Join sync: every tab receives the full in-memory workspace snapshot so
    // late joiners get all file names and contents before editing.
    socket.emit("workspace-state", getWorkspaceState(workspaceId));
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
});

server.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
