import type {
  CodeChangePayload,
  CreateFilePayload,
  DeleteFilePayload,
  RenameFilePayload,
  RenameWorkspacePayload,
  WorkspaceFile
} from "../types.js";
import { logger } from "../logger.js";
import { WorkspaceStateStore } from "../workspaceState.js";
import { DebouncedPersistence } from "./debouncedPersistence.js";

export type WorkspacePersistence = {
  loadWorkspace?: (
    workspaceId: string
  ) => Promise<
    | {
        files: WorkspaceFile[];
        name: string;
      }
    | null
    | undefined
  >;
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
  renameWorkspace?: (workspaceId: string, name: string) => Promise<void>;
  saveFileContent?: (
    workspaceId: string,
    fileId: string,
    content: string
  ) => Promise<void>;
  deleteFile?: (workspaceId: string, fileId: string) => Promise<void>;
  touchWorkspace?: (workspaceId: string) => Promise<void>;
};

type WorkspaceServiceOptions = {
  contentWriteDelayMs?: number;
  persistence?: WorkspacePersistence;
  workspaces?: WorkspaceStateStore;
};

export class WorkspaceService {
  readonly workspaces: WorkspaceStateStore;
  private readonly contentPersistence: DebouncedPersistence;
  private readonly persistence: WorkspacePersistence;
  private readonly workspaceLoadPromises = new Map<string, Promise<LoadWorkspaceResult>>();

  constructor(options: WorkspaceServiceOptions = {}) {
    this.workspaces = options.workspaces ?? new WorkspaceStateStore();
    this.persistence = options.persistence ?? {};
    this.contentPersistence = new DebouncedPersistence({
      delayMs: options.contentWriteDelayMs ?? 800,
      onSave: (workspaceId, fileId) =>
        this.persistLatestContent(workspaceId, fileId)
    });
  }

  async loadWorkspace(
    workspaceId: string,
    options: { createIfMissing?: boolean } = {}
  ): Promise<LoadWorkspaceResult> {
    if (this.workspaces.hasWorkspace(workspaceId)) {
      void this.touchWorkspaceActivity(workspaceId, "join-workspace");
      return { ok: true };
    }

    const existingLoad = this.workspaceLoadPromises.get(workspaceId);

    if (existingLoad) {
      return existingLoad;
    }

    const loadPromise = (async () => {
      try {
        let persistedWorkspace:
          | {
              files: WorkspaceFile[];
              name: string;
            }
          | null
          | undefined;

        try {
          persistedWorkspace = await this.persistence.loadWorkspace?.(workspaceId);
        } catch (error) {
          logger.error("database unavailable", {
            operation: "load-workspace",
            workspaceId
          });
        }

        if (persistedWorkspace && persistedWorkspace.files.length > 0) {
          this.workspaces.setWorkspaceFiles(workspaceId, persistedWorkspace.files);
          this.workspaces.setWorkspaceName(workspaceId, persistedWorkspace.name);
          void this.touchWorkspaceActivity(workspaceId, "join-workspace");
          logger.info("workspace loaded from PostgreSQL", {
            fileCount: persistedWorkspace.files.length,
            workspaceId
          });
          return { ok: true as const };
        }

        if (persistedWorkspace === null && !options.createIfMissing) {
          logger.info("workspace not found", { workspaceId });
          return {
            ok: false as const,
            code: "WORKSPACE_NOT_FOUND" as const,
            error: "Workspace not found or expired."
          };
        }

        const defaultFiles = Array.from(this.workspaces.createDefaultWorkspace().values());
        this.workspaces.setWorkspaceFiles(workspaceId, defaultFiles);
        try {
          await this.persistence.createWorkspace?.(workspaceId, defaultFiles);
        } catch (error) {
          logger.error("failed to persist created workspace", {
            workspaceId
          });
        }
        logger.info("workspace created", {
          fileCount: defaultFiles.length,
          workspaceId
        });
        return { ok: true as const };
      } finally {
        this.workspaceLoadPromises.delete(workspaceId);
      }
    })();

    this.workspaceLoadPromises.set(workspaceId, loadPromise);
    return loadPromise;
  }

  getLoadedWorkspaceIds() {
    return this.workspaces.getWorkspaceIds();
  }

  getWorkspaceState(workspaceId: string) {
    return this.workspaces.getWorkspaceState(workspaceId);
  }

  createFile(payload: CreateFilePayload) {
    const result = this.workspaces.createFile(payload.workspaceId, payload.fileName);

    if (result.ok && this.persistence.saveFile) {
      void this.persistence
        .saveFile(payload.workspaceId, result.file)
        .then(() => {
          logger.info("file persisted", {
            fileId: result.file.fileId,
            workspaceId: payload.workspaceId
          });
        })
        .catch(() => {
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

    if (result.ok && this.persistence.renameFile) {
      void this.persistence
        .renameFile(
          payload.workspaceId,
          payload.fileId,
          result.file.fileName,
          result.file.language
        )
        .then(() => {
          logger.info("rename persisted", {
            fileId: payload.fileId,
            workspaceId: payload.workspaceId
          });
        })
        .catch(() => {
          logger.error("failed to persist renamed file", {
            fileId: payload.fileId,
            workspaceId: payload.workspaceId
          });
        });
    }

    return result;
  }

  renameWorkspace(payload: RenameWorkspacePayload) {
    const result = this.workspaces.renameWorkspace(
      payload.workspaceId,
      payload.name
    );

    if (result.ok && this.persistence.renameWorkspace) {
      void this.persistence
        .renameWorkspace(payload.workspaceId, result.name)
        .then(() => {
          logger.info("workspace rename persisted", {
            workspaceId: payload.workspaceId
          });
        })
        .catch(() => {
          logger.error("failed to persist workspace rename", {
            workspaceId: payload.workspaceId
          });
        });
    }

    return result;
  }

  deleteFile(payload: DeleteFilePayload) {
    const result = this.workspaces.deleteFile(payload.workspaceId, payload.fileId);

    if (result.ok) {
      this.contentPersistence.cancel(payload.workspaceId, payload.fileId);

      if (this.persistence.deleteFile) {
        void this.persistence
          .deleteFile(payload.workspaceId, payload.fileId)
          .then(() => {
            logger.info("delete persisted", {
              fileId: payload.fileId,
              workspaceId: payload.workspaceId
            });
          })
          .catch(() => {
            logger.error("failed to persist deleted file", {
              fileId: payload.fileId,
              workspaceId: payload.workspaceId
            });
          });
      }
    }

    return result;
  }

  updateFileContent(payload: CodeChangePayload) {
    const result = this.workspaces.updateFileContent(payload);

    if (result.ok && this.persistence.saveFileContent) {
      this.contentPersistence.schedule({
        fileId: payload.fileId,
        workspaceId: payload.workspaceId
      });
    }

    return result;
  }

  hasFile(workspaceId: string, fileId: string) {
    return this.workspaces.getWorkspaceFiles(workspaceId).has(fileId);
  }

  async flushPendingWrites() {
    await this.contentPersistence.flushAll();
  }

  private async persistLatestContent(workspaceId: string, fileId: string) {
    const file = this.workspaces.getWorkspaceFiles(workspaceId).get(fileId);

    if (!file || !this.persistence.saveFileContent) {
      return;
    }

    try {
      await this.persistence.saveFileContent(workspaceId, fileId, file.content);
      logger.info("content persisted", {
        fileId,
        workspaceId
      });
    } catch (error) {
      logger.error("failed to persist file content", {
        fileId,
        workspaceId
      });
      this.contentPersistence.schedule({ fileId, workspaceId });
    }
  }

  private async touchWorkspaceActivity(workspaceId: string, operation: string) {
    if (!this.persistence.touchWorkspace) {
      return;
    }

    try {
      await this.persistence.touchWorkspace(workspaceId);
    } catch (error) {
      logger.error("failed to update workspace activity", {
        operation,
        workspaceId
      });
    }
  }
}

export type LoadWorkspaceResult =
  | { ok: true }
  | { ok: false; code: "WORKSPACE_NOT_FOUND"; error: string };
