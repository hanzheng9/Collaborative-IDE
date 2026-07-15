export type ConnectionStatusValue =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "reconnection-failed";

export type SyncStatusValue =
  | "synced"
  | "syncing"
  | "unsaved"
  | "connection-lost";

export type CodeChangePayload = {
  workspaceId: string;
  fileId: string;
  code: string;
};

export type WorkspaceFile = {
  fileId: string;
  fileName: string;
  language: string;
  content: string;
};

export type WorkspaceStatePayload = {
  workspaceId: string;
  files: WorkspaceFile[];
};

export type FileCreatedPayload = {
  workspaceId: string;
  file: WorkspaceFile;
  createdBy: string;
};

export type FileRenamedPayload = {
  workspaceId: string;
  file: WorkspaceFile;
};

export type FileDeletedPayload = {
  workspaceId: string;
  fileId: string;
  fallbackFileId: string | null;
  deletedBy: string;
};

export type AppErrorPayload = {
  code:
    | "WORKSPACE_NOT_FOUND"
    | "FILE_NOT_FOUND"
    | "DUPLICATE_FILENAME"
    | "INVALID_FILENAME"
    | "CANNOT_DELETE_LAST_FILE"
    | "INVALID_CURSOR_POSITION"
    | "NOT_CONNECTED"
    | "FILE_OPERATION_FAILED"
    | "INTERNAL_SERVER_ERROR";
  message: string;
  operation?: string;
  workspaceId?: string;
  fileId?: string;
};

export type CursorPosition = {
  lineNumber: number;
  column: number;
};

export type Collaborator = {
  userId: string;
  displayName: string;
  color: string;
  currentFileId: string;
  cursorPosition: CursorPosition | null;
};

export type CollaboratorsStatePayload = {
  workspaceId: string;
  collaborators: Collaborator[];
};
