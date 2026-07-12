export type ConnectionStatusValue =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting";

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

export type FileOperationErrorPayload = {
  message: string;
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
