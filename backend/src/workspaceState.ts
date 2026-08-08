import { randomUUID } from "node:crypto";
import { validateFileName } from "./filename.js";
import { getLanguageForFile } from "./language.js";
import type {
  AppErrorPayload,
  CodeChangePayload,
  WorkspaceFile,
  WorkspaceState
} from "./types.js";

type WorkspaceErrorCode = AppErrorPayload["code"];

export const defaultCode = `function greet(name: string) {
  return \`Hello, \${name}!\`;
}

console.log(greet("Collaborative IDE"));
`;

type WorkspaceStateStoreOptions = {
  generateFileId?: () => string;
};

export class WorkspaceStateStore {
  private readonly workspaces = new Map<string, Map<string, WorkspaceFile>>();
  private readonly generateFileId: () => string;

  constructor(options: WorkspaceStateStoreOptions = {}) {
    this.generateFileId = options.generateFileId ?? randomUUID;
  }

  createDefaultWorkspace() {
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

  setWorkspaceFiles(workspaceId: string, files: WorkspaceFile[]) {
    this.workspaces.set(
      workspaceId,
      new Map(files.map((file) => [file.fileId, file]))
    );
  }

  hasWorkspace(workspaceId: string) {
    return this.workspaces.has(workspaceId);
  }

  getWorkspaceIds() {
    return Array.from(this.workspaces.keys());
  }

  getWorkspaceFiles(workspaceId: string) {
    let files = this.workspaces.get(workspaceId);

    if (!files) {
      files = this.createDefaultWorkspace();
      this.workspaces.set(workspaceId, files);
    }

    return files;
  }

  getWorkspaceState(workspaceId: string): WorkspaceState {
    return {
      workspaceId,
      files: Array.from(this.getWorkspaceFiles(workspaceId).values())
    };
  }

  createFile(workspaceId: string, fileName: string) {
    const files = this.getWorkspaceFiles(workspaceId);
    const validation = validateFileName(fileName, files.values());

    if (!validation.ok) {
      return validation;
    }

    const file: WorkspaceFile = {
      fileId: this.generateFileId(),
      fileName: validation.fileName,
      language: getLanguageForFile(validation.fileName),
      content: ""
    };

    files.set(file.fileId, file);

    return { ok: true as const, file };
  }

  renameFile(workspaceId: string, fileId: string, fileName: string) {
    const files = this.getWorkspaceFiles(workspaceId);
    const file = files.get(fileId);

    if (!file) {
      return {
        ok: false as const,
        code: "FILE_NOT_FOUND" as WorkspaceErrorCode,
        error: "The selected file no longer exists."
      };
    }

    const validation = validateFileName(fileName, files.values(), fileId);

    if (!validation.ok) {
      return validation;
    }

    file.fileName = validation.fileName;
    file.language = getLanguageForFile(validation.fileName);

    return { ok: true as const, file };
  }

  updateFileContent({ workspaceId, fileId, code }: CodeChangePayload) {
    const file = this.getWorkspaceFiles(workspaceId).get(fileId);

    if (!file) {
      return {
        ok: false as const,
        code: "FILE_NOT_FOUND" as WorkspaceErrorCode,
        error: "The selected file no longer exists."
      };
    }

    file.content = code;

    return { ok: true as const, file };
  }

  deleteFile(workspaceId: string, fileId: string) {
    const files = this.getWorkspaceFiles(workspaceId);
    const file = files.get(fileId);

    if (!file) {
      return {
        ok: false as const,
        code: "FILE_NOT_FOUND" as WorkspaceErrorCode,
        error: "The selected file no longer exists."
      };
    }

    if (files.size <= 1) {
      return {
        ok: false as const,
        code: "CANNOT_DELETE_LAST_FILE" as WorkspaceErrorCode,
        error: "A workspace must contain at least one file."
      };
    }

    const orderedFiles = Array.from(files.values());
    const deletedIndex = orderedFiles.findIndex((item) => item.fileId === fileId);
    const fallbackFile =
      orderedFiles[deletedIndex + 1] ?? orderedFiles[deletedIndex - 1] ?? null;

    files.delete(fileId);

    return {
      ok: true as const,
      deletedFileId: fileId,
      fallbackFileId: fallbackFile?.fileId ?? null
    };
  }
}
