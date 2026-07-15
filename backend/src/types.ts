export type CodeChangePayload = {
  workspaceId: string;
  fileId: string;
  code: string;
};

export type JoinWorkspacePayload = {
  workspaceId: string;
};

export type CreateFilePayload = {
  workspaceId: string;
  fileName: string;
};

export type RenameFilePayload = {
  workspaceId: string;
  fileId: string;
  fileName: string;
};

export type DeleteFilePayload = {
  workspaceId: string;
  fileId: string;
};

export type FileSelectedPayload = {
  workspaceId: string;
  fileId: string;
};

export type CursorPosition = {
  lineNumber: number;
  column: number;
};

export type CursorChangePayload = {
  workspaceId: string;
  fileId: string;
  cursorPosition: CursorPosition;
};

export type WorkspaceFile = {
  fileId: string;
  fileName: string;
  language: string;
  content: string;
};

export type Collaborator = {
  userId: string;
  displayName: string;
  color: string;
  currentFileId: string;
  cursorPosition: CursorPosition | null;
};

export type WorkspaceState = {
  workspaceId: string;
  files: WorkspaceFile[];
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
