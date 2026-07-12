import type { Server, Socket } from "socket.io";
import { CollaboratorStateStore } from "./collaboratorState.js";
import type {
  CodeChangePayload,
  CreateFilePayload,
  CursorChangePayload,
  FileSelectedPayload,
  JoinWorkspacePayload,
  RenameFilePayload,
  WorkspaceFile
} from "./types.js";
import { WorkspaceStateStore } from "./workspaceState.js";

export type SocketPersistence = {
  loadWorkspace?: (workspaceId: string) => Promise<WorkspaceFile[] | null>;
  createWorkspace?: (
    workspaceId: string,
    files: WorkspaceFile[]
  ) => Promise<void>;
  saveFile?: (workspaceId: string, file: WorkspaceFile) => Promise<void>;
  renameFile?: (
    workspaceId: string,
    fileId: string,
    fileName: string,
    language: string
  ) => Promise<void>;
  saveFileContent?: (
    workspaceId: string,
    fileId: string,
    content: string
  ) => Promise<void>;
};

type RegisterSocketHandlersOptions = {
  collaborators?: CollaboratorStateStore;
  contentWriteDelayMs?: number;
  persistence?: SocketPersistence;
  workspaces?: WorkspaceStateStore;
};

function isValidId(value: string) {
  return typeof value === "string" && value.trim().length > 0;
}

function emitFileOperationError(socket: Socket, message: string) {
  socket.emit("file-operation-error", { message });
}

export function registerSocketHandlers(
  io: Server,
  options: RegisterSocketHandlersOptions = {}
) {
  const workspaces = options.workspaces ?? new WorkspaceStateStore();
  const collaborators = options.collaborators ?? new CollaboratorStateStore();
  const persistence = options.persistence ?? {};
  const contentWriteDelayMs = options.contentWriteDelayMs ?? 800;
  const workspaceLoadPromises = new Map<string, Promise<void>>();
  const pendingContentWrites = new Map<string, NodeJS.Timeout>();

  async function loadWorkspaceIntoMemory(workspaceId: string) {
    if (workspaces.hasWorkspace(workspaceId)) {
      return;
    }

    const existingLoad = workspaceLoadPromises.get(workspaceId);

    if (existingLoad) {
      await existingLoad;
      return;
    }

    const loadPromise = (async () => {
      try {
        const files = await persistence.loadWorkspace?.(workspaceId);

        if (files && files.length > 0) {
          workspaces.setWorkspaceFiles(workspaceId, files);
          return;
        }

        const defaultFiles = Array.from(
          workspaces.getWorkspaceFiles(workspaceId).values()
        );
        await persistence.createWorkspace?.(workspaceId, defaultFiles);
      } catch (error) {
        console.error("Failed to load workspace:", error);
        workspaces.getWorkspaceFiles(workspaceId);
      } finally {
        workspaceLoadPromises.delete(workspaceId);
      }
    })();

    workspaceLoadPromises.set(workspaceId, loadPromise);
    await loadPromise;
  }

  function broadcastCollaborators(workspaceId: string) {
    io.to(workspaceId).emit("collaborators-state", {
      workspaceId,
      collaborators: collaborators.getCollaborators(workspaceId)
    });
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

    const file = workspaces.getWorkspaceFiles(workspaceId).get(fileId);

    if (!file) {
      return;
    }

    try {
      await persistence.saveFileContent?.(workspaceId, fileId, file.content);
    } catch (error) {
      console.error("Failed to persist file content:", error);
      scheduleContentSave(workspaceId, fileId);
    }
  }

  async function flushPendingWrites() {
    const pendingWrites = Array.from(pendingContentWrites.keys()).map(
      (writeKey) => {
        const [workspaceId, fileId] = writeKey.split(":");
        const pendingWrite = pendingContentWrites.get(writeKey);

        if (pendingWrite) {
          clearTimeout(pendingWrite);
        }

        return flushContentSave(workspaceId, fileId);
      }
    );

    await Promise.allSettled(pendingWrites);
  }

  io.on("connection", (socket) => {
    socket.on("join-workspace", async ({ workspaceId }: JoinWorkspacePayload) => {
      if (!isValidId(workspaceId)) {
        socket.emit("workspace-error", { message: "Invalid workspaceId" });
        return;
      }

      await loadWorkspaceIntoMemory(workspaceId);

      socket.join(workspaceId);
      const firstFileId =
        workspaces.getWorkspaceState(workspaceId).files[0]?.fileId ?? "main.ts";
      collaborators.addCollaborator(workspaceId, socket.id, firstFileId);

      socket.emit("workspace-state", workspaces.getWorkspaceState(workspaceId));
      broadcastCollaborators(workspaceId);
    });

    socket.on("create-file", (payload: CreateFilePayload) => {
      if (!isValidId(payload.workspaceId) || !isValidId(payload.fileName)) {
        emitFileOperationError(socket, "Enter a valid filename.");
        return;
      }

      const result = workspaces.createFile(payload.workspaceId, payload.fileName);

      if (!result.ok) {
        emitFileOperationError(socket, result.error);
        return;
      }

      void persistence.saveFile?.(payload.workspaceId, result.file).catch((error) => {
        console.error("Failed to persist created file:", error);
      });

      io.to(payload.workspaceId).emit("file-created", {
        workspaceId: payload.workspaceId,
        file: result.file,
        createdBy: socket.id
      });
    });

    socket.on("rename-file", (payload: RenameFilePayload) => {
      if (
        !isValidId(payload.workspaceId) ||
        !isValidId(payload.fileId) ||
        !isValidId(payload.fileName)
      ) {
        emitFileOperationError(socket, "Enter a valid filename.");
        return;
      }

      const result = workspaces.renameFile(
        payload.workspaceId,
        payload.fileId,
        payload.fileName
      );

      if (!result.ok) {
        emitFileOperationError(socket, result.error);
        return;
      }

      void persistence
        .renameFile?.(
          payload.workspaceId,
          payload.fileId,
          result.file.fileName,
          result.file.language
        )
        .catch((error) => {
          console.error("Failed to persist renamed file:", error);
        });

      io.to(payload.workspaceId).emit("file-renamed", {
        workspaceId: payload.workspaceId,
        file: result.file
      });
    });

    socket.on("file-selected", ({ workspaceId, fileId }: FileSelectedPayload) => {
      if (!isValidId(workspaceId) || !isValidId(fileId)) {
        return;
      }

      if (!collaborators.updateCurrentFile(workspaceId, socket.id, fileId)) {
        return;
      }

      broadcastCollaborators(workspaceId);
    });

    socket.on("cursor-change", (payload: CursorChangePayload) => {
      if (!isValidId(payload.workspaceId) || !isValidId(payload.fileId)) {
        return;
      }

      if (
        !collaborators.updateCursor(
          payload.workspaceId,
          socket.id,
          payload.fileId,
          payload.cursorPosition
        )
      ) {
        return;
      }

      broadcastCollaborators(payload.workspaceId);
    });

    socket.on("code-change", (payload: CodeChangePayload) => {
      if (!isValidId(payload.workspaceId) || !isValidId(payload.fileId)) {
        return;
      }

      const result = workspaces.updateFileContent(payload);

      if (!result.ok) {
        return;
      }

      scheduleContentSave(payload.workspaceId, payload.fileId);

      socket.to(payload.workspaceId).emit("code-change", {
        workspaceId: payload.workspaceId,
        fileId: payload.fileId,
        code: result.file.content
      });
    });

    socket.on("disconnect", () => {
      const workspaceId = collaborators.removeCollaborator(socket.id);

      if (!workspaceId) {
        return;
      }

      broadcastCollaborators(workspaceId);
    });
  });

  return {
    collaborators,
    flushPendingWrites,
    workspaces
  };
}
