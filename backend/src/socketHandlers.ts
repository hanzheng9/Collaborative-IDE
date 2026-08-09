import type { Server, Socket } from "socket.io";
import { CollaboratorStateStore } from "./collaboratorState.js";
import { logger } from "./logger.js";
import { WorkspaceService, type WorkspacePersistence } from "./services/workspaceService.js";
import type {
  AppErrorPayload,
  ClientToServerEvents,
  OperationAck,
  ServerToClientEvents
} from "./types.js";
import {
  createError,
  isCodeChangePayload,
  isCreateFilePayload,
  isCursorChangePayload,
  isDeleteFilePayload,
  isFileSelectedPayload,
  isJoinWorkspacePayload,
  isRenameFilePayload,
  isRenameWorkspacePayload
} from "./validation/socketValidation.js";
import { WorkspaceStateStore } from "./workspaceState.js";

type RegisterSocketHandlersOptions = {
  collaborators?: CollaboratorStateStore;
  contentWriteDelayMs?: number;
  persistence?: WorkspacePersistence;
  workspaces?: WorkspaceStateStore;
  workspaceService?: WorkspaceService;
};

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

function emitOperationError(
  socket: TypedSocket,
  error: AppErrorPayload,
  ack?: (payload: OperationAck) => void
) {
  socket.emit("file-operation-error", error);
  ack?.({ ok: false, error });
  logger.warn("socket validation failed", {
    code: error.code,
    fileId: error.fileId,
    operation: error.operation,
    socketId: socket.id,
    workspaceId: error.workspaceId
  });
}

function getPayloadDetails(
  payload: unknown,
  operation: string
): Pick<AppErrorPayload, "operation" | "workspaceId" | "fileId"> {
  const details: Pick<AppErrorPayload, "operation" | "workspaceId" | "fileId"> = {
    operation
  };

  if (typeof payload !== "object" || payload === null) {
    return details;
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.workspaceId === "string") {
    details.workspaceId = record.workspaceId;
  }

  if (typeof record.fileId === "string") {
    details.fileId = record.fileId;
  }

  return details;
}

export function registerSocketHandlers(
  io: TypedServer,
  options: RegisterSocketHandlersOptions = {}
) {
  const workspaceService =
    options.workspaceService ??
    new WorkspaceService({
      contentWriteDelayMs: options.contentWriteDelayMs,
      persistence: options.persistence,
      workspaces: options.workspaces
    });
  const collaborators = options.collaborators ?? new CollaboratorStateStore();

  function broadcastCollaborators(workspaceId: string) {
    io.to(workspaceId).emit("collaborators-state", {
      workspaceId,
      collaborators: collaborators.getCollaborators(workspaceId)
    });
  }

  function removeCollaboratorFromWorkspace(socket: TypedSocket) {
    const workspaceId = collaborators.removeCollaborator(socket.id);

    if (!workspaceId) {
      return null;
    }

    socket.leave(workspaceId);
    broadcastCollaborators(workspaceId);

    return workspaceId;
  }

  function moveCollaboratorsOffDeletedFile(
    workspaceId: string,
    deletedFileId: string,
    fallbackFileId: string | null
  ) {
    if (!fallbackFileId) {
      return;
    }

    for (const collaborator of collaborators.getCollaborators(workspaceId)) {
      if (collaborator.currentFileId === deletedFileId) {
        collaborators.updateCurrentFile(
          workspaceId,
          collaborator.userId,
          fallbackFileId
        );
      }
    }
  }

  io.on("connection", (socket) => {
    const typedSocket = socket as TypedSocket;
    logger.info("socket connected", { socketId: typedSocket.id });

    typedSocket.on("join-workspace", async (payload) => {
      if (!isJoinWorkspacePayload(payload)) {
        typedSocket.emit(
          "workspace-error",
          createError("WORKSPACE_NOT_FOUND", "Invalid workspaceId.", {
            operation: "join-workspace"
          })
        );
        return;
      }

      try {
        const result = await workspaceService.loadWorkspace(payload.workspaceId, {
          createIfMissing: payload.createIfMissing
        });

        if (!result.ok) {
          typedSocket.emit(
            "workspace-error",
            createError(result.code, result.error, {
              operation: "join-workspace",
              workspaceId: payload.workspaceId
            })
          );
          return;
        }
      } catch (error) {
        logger.error("workspace load failed", {
          socketId: typedSocket.id,
          workspaceId: payload.workspaceId
        });
        typedSocket.emit(
          "workspace-error",
          createError("INTERNAL_SERVER_ERROR", "Unable to load workspace.", {
            operation: "join-workspace",
            workspaceId: payload.workspaceId
          })
        );
        return;
      }

      removeCollaboratorFromWorkspace(typedSocket);
      typedSocket.join(payload.workspaceId);
      const workspaceState = workspaceService.getWorkspaceState(payload.workspaceId);
      const firstFileId = workspaceState.files[0]?.fileId ?? "main.ts";
      collaborators.addCollaborator(payload.workspaceId, typedSocket.id, firstFileId);

      typedSocket.emit("workspace-state", workspaceState);
      broadcastCollaborators(payload.workspaceId);
      logger.info("workspace joined", {
        fileCount: workspaceState.files.length,
        socketId: typedSocket.id,
        workspaceId: payload.workspaceId
      });
    });

    typedSocket.on("leave-workspace", () => {
      const workspaceId = removeCollaboratorFromWorkspace(typedSocket);

      logger.info("workspace left", {
        socketId: typedSocket.id,
        workspaceId
      });
    });

    typedSocket.on("rename-workspace", (payload, ack) => {
      if (!isRenameWorkspacePayload(payload)) {
        emitOperationError(
          typedSocket,
          createError(
            "INVALID_WORKSPACE_NAME",
            "Enter a valid workspace name.",
            {
              ...getPayloadDetails(payload, "rename-workspace")
            }
          ),
          ack
        );
        return;
      }

      const result = workspaceService.renameWorkspace(payload);

      if (!result.ok) {
        emitOperationError(
          typedSocket,
          createError(result.code, result.error, {
            operation: "rename-workspace",
            workspaceId: payload.workspaceId
          }),
          ack
        );
        return;
      }

      io.to(payload.workspaceId).emit("workspace-renamed", {
        workspaceId: payload.workspaceId,
        name: result.name
      });
      ack?.({ ok: true });
      logger.info("workspace renamed", {
        socketId: typedSocket.id,
        workspaceId: payload.workspaceId
      });
    });

    typedSocket.on("create-file", (payload, ack) => {
      if (!isCreateFilePayload(payload)) {
        emitOperationError(
          typedSocket,
          createError("INVALID_FILENAME", "Enter a valid filename.", {
            ...getPayloadDetails(payload, "create-file")
          }),
          ack
        );
        return;
      }

      const result = workspaceService.createFile(payload);

      if (!result.ok) {
        emitOperationError(
          typedSocket,
          createError(result.code, result.error, {
            operation: "create-file",
            workspaceId: payload.workspaceId
          }),
          ack
        );
        return;
      }

      io.to(payload.workspaceId).emit("file-created", {
        workspaceId: payload.workspaceId,
        file: result.file,
        createdBy: typedSocket.id
      });
      ack?.({ ok: true });
      logger.info("file created", {
        fileId: result.file.fileId,
        socketId: typedSocket.id,
        workspaceId: payload.workspaceId
      });
    });

    typedSocket.on("rename-file", (payload, ack) => {
      if (!isRenameFilePayload(payload)) {
        emitOperationError(
          typedSocket,
          createError("INVALID_FILENAME", "Enter a valid filename.", {
            ...getPayloadDetails(payload, "rename-file")
          }),
          ack
        );
        return;
      }

      const result = workspaceService.renameFile(payload);

      if (!result.ok) {
        emitOperationError(
          typedSocket,
          createError(result.code, result.error, {
            operation: "rename-file",
            workspaceId: payload.workspaceId,
            fileId: payload.fileId
          }),
          ack
        );
        return;
      }

      io.to(payload.workspaceId).emit("file-renamed", {
        workspaceId: payload.workspaceId,
        file: result.file
      });
      ack?.({ ok: true });
      logger.info("file renamed", {
        fileId: payload.fileId,
        socketId: typedSocket.id,
        workspaceId: payload.workspaceId
      });
    });

    typedSocket.on("delete-file", (payload, ack) => {
      if (!isDeleteFilePayload(payload)) {
        emitOperationError(
          typedSocket,
          createError("FILE_NOT_FOUND", "The selected file no longer exists.", {
            ...getPayloadDetails(payload, "delete-file")
          }),
          ack
        );
        return;
      }

      const result = workspaceService.deleteFile(payload);

      if (!result.ok) {
        emitOperationError(
          typedSocket,
          createError(result.code, result.error, {
            operation: "delete-file",
            workspaceId: payload.workspaceId,
            fileId: payload.fileId
          }),
          ack
        );
        return;
      }

      moveCollaboratorsOffDeletedFile(
        payload.workspaceId,
        payload.fileId,
        result.fallbackFileId
      );

      io.to(payload.workspaceId).emit("file-deleted", {
        workspaceId: payload.workspaceId,
        fileId: payload.fileId,
        fallbackFileId: result.fallbackFileId,
        deletedBy: typedSocket.id
      });
      broadcastCollaborators(payload.workspaceId);
      ack?.({ ok: true });
      logger.info("file deleted", {
        fileId: payload.fileId,
        socketId: typedSocket.id,
        workspaceId: payload.workspaceId
      });
    });

    typedSocket.on("file-selected", (payload) => {
      if (
        !isFileSelectedPayload(payload) ||
        !workspaceService.hasFile(payload.workspaceId, payload.fileId)
      ) {
        typedSocket.emit(
          "file-operation-error",
          createError("FILE_NOT_FOUND", "The selected file no longer exists.", {
            ...getPayloadDetails(payload, "file-selected")
          })
        );
        return;
      }

      if (!collaborators.updateCurrentFile(payload.workspaceId, typedSocket.id, payload.fileId)) {
        return;
      }

      broadcastCollaborators(payload.workspaceId);
    });

    typedSocket.on("cursor-change", (payload) => {
      if (
        !isCursorChangePayload(payload) ||
        !workspaceService.hasFile(payload.workspaceId, payload.fileId)
      ) {
        typedSocket.emit(
          "file-operation-error",
          createError("INVALID_CURSOR_POSITION", "Invalid cursor update.", {
            ...getPayloadDetails(payload, "cursor-change")
          })
        );
        return;
      }

      if (
        !collaborators.updateCursor(
          payload.workspaceId,
          typedSocket.id,
          payload.fileId,
          payload.cursorPosition
        )
      ) {
        return;
      }

      broadcastCollaborators(payload.workspaceId);
    });

    typedSocket.on("code-change", (payload) => {
      if (!isCodeChangePayload(payload)) {
        typedSocket.emit(
          "file-operation-error",
          createError("FILE_OPERATION_FAILED", "Invalid code change.", {
            ...getPayloadDetails(payload, "code-change")
          })
        );
        return;
      }

      const result = workspaceService.updateFileContent(payload);

      if (!result.ok) {
        typedSocket.emit(
          "file-operation-error",
          createError(result.code, result.error, {
            operation: "code-change",
            workspaceId: payload.workspaceId,
            fileId: payload.fileId
          })
        );
        return;
      }

      typedSocket.to(payload.workspaceId).emit("code-change", {
        workspaceId: payload.workspaceId,
        fileId: payload.fileId,
        code: result.file.content
      });
    });

    typedSocket.on("disconnect", (reason) => {
      const workspaceId = removeCollaboratorFromWorkspace(typedSocket);

      logger.info("socket disconnected", {
        reason,
        socketId: typedSocket.id,
        workspaceId
      });
    });
  });

  return {
    collaborators,
    flushPendingWrites: () => workspaceService.flushPendingWrites(),
    workspaceService,
    workspaces: workspaceService.workspaces
  };
}
