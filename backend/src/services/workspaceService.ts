import type {
  CodeChangePayload,
  CreateFilePayload,
  DeleteFilePayload,
  RenameFilePayload,
  WorkspaceFile
} from "../types.js";
import { logger } from "../logger.js";
import { WorkspaceStateStore } from "../workspaceState.js";

export type WorkspacePersistence = {
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

type WorkspaceServiceOptions = {
  contentWriteDelayMs?: number;
  persistence?: WorkspacePersistence;
  workspaces?: WorkspaceStateStore;
};

export class WorkspaceService {
  readonly workspaces: WorkspaceStateStore;
  private readonly contentWriteDelayMs: number;
  private readonly persistence: WorkspacePersistence;
  private readonly workspaceLoadPromises = new Map<string, Promise<void>>();
  private readonly pendingContentWrites = new Map<string, NodeJS.Timeout>();

  constructor(options: WorkspaceServiceOptions = {}) {
    this.workspaces = options.workspaces ?? new WorkspaceStateStore();
    this.persistence = options.persistence ?? {};
    this.contentWriteDelayMs = options.contentWriteDelayMs ?? 800;
  }

  async loadWorkspace(workspaceId: string) {
    if (this.workspaces.hasWorkspace(workspaceId)) {
      return;
    }

    const existingLoad = this.workspaceLoadPromises.get(workspaceId);

    if (existingLoad) {
      await existingLoad;
      return;
    }

    const loadPromise = (async () => {
      try {
        const files = await this.persistence.loadWorkspace?.(workspaceId);

        if (files && files.length > 0) {
          this.workspaces.setWorkspaceFiles(workspaceId, files);
          return;
        }

        const defaultFiles = Array.from(
          this.workspaces.getWorkspaceFiles(workspaceId).values()
        );
        await this.persistence.createWorkspace?.(workspaceId, defaultFiles);
      } finally {
        this.workspaceLoadPromises.delete(workspaceId);
      }
    })();

    this.workspaceLoadPromises.set(workspaceId, loadPromise);
    await loadPromise;
  }

  getWorkspaceState(workspaceId: string) {
    return this.workspaces.getWorkspaceState(workspaceId);
  }

  createFile(payload: CreateFilePayload) {
    const result = this.workspaces.createFile(payload.workspaceId, payload.fileName);

    if (result.ok) {
      void this.persistence.saveFile?.(payload.workspaceId, result.file).catch(() => {
        logger.error("failed to persist created file", {
          fileId: result.file.fileId,
          workspaceId: payload.workspaceId
        });
      });
    }

    return result;
  }

  renameFile(payload: RenameFilePayload) {
    const result = this.workspaces.renameFile(
      payload.workspaceId,
      payload.fileId,
      payload.fileName
    );

    if (result.ok) {
      void this.persistence.renameFile?.(
        payload.workspaceId,
        payload.fileId,
        result.file.fileName,
        result.file.language
      ).catch(() => {
        logger.error("failed to persist renamed file", {
          fileId: payload.fileId,
          workspaceId: payload.workspaceId
        });
      });
    }

    return result;
  }

  deleteFile(payload: DeleteFilePayload) {
    const result = this.workspaces.deleteFile(payload.workspaceId, payload.fileId);

    if (result.ok) {
      this.clearPendingWrite(payload.workspaceId, payload.fileId);
    }

    return result;
  }

  updateFileContent(payload: CodeChangePayload) {
    const result = this.workspaces.updateFileContent(payload);

    if (result.ok) {
      this.scheduleContentSave(payload.workspaceId, payload.fileId);
    }

    return result;
  }

  hasFile(workspaceId: string, fileId: string) {
    return this.workspaces.getWorkspaceFiles(workspaceId).has(fileId);
  }

  async flushPendingWrites() {
    const pendingWrites = Array.from(this.pendingContentWrites.keys()).map(
      (writeKey) => {
        const [workspaceId, fileId] = writeKey.split(":");
        this.clearPendingWrite(workspaceId, fileId);
        return this.flushContentSave(workspaceId, fileId);
      }
    );

    await Promise.allSettled(pendingWrites);
  }

  private getWriteKey(workspaceId: string, fileId: string) {
    return `${workspaceId}:${fileId}`;
  }

  private scheduleContentSave(workspaceId: string, fileId: string) {
    const writeKey = this.getWriteKey(workspaceId, fileId);
    const pendingWrite = this.pendingContentWrites.get(writeKey);

    if (pendingWrite) {
      clearTimeout(pendingWrite);
    }

    this.pendingContentWrites.set(
      writeKey,
      setTimeout(() => {
        void this.flushContentSave(workspaceId, fileId);
      }, this.contentWriteDelayMs)
    );
  }

  private clearPendingWrite(workspaceId: string, fileId: string) {
    const writeKey = this.getWriteKey(workspaceId, fileId);
    const pendingWrite = this.pendingContentWrites.get(writeKey);

    if (pendingWrite) {
      clearTimeout(pendingWrite);
    }

    this.pendingContentWrites.delete(writeKey);
  }

  private async flushContentSave(workspaceId: string, fileId: string) {
    this.clearPendingWrite(workspaceId, fileId);

    const file = this.workspaces.getWorkspaceFiles(workspaceId).get(fileId);

    if (!file) {
      return;
    }

    try {
      await this.persistence.saveFileContent?.(workspaceId, fileId, file.content);
    } catch (error) {
      logger.error("failed to persist file content", {
        fileId,
        workspaceId
      });
      this.scheduleContentSave(workspaceId, fileId);
    }
  }
}
