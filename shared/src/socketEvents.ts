export type CodeChangePayload = {
  workspaceId: string;
  fileId: string;
  code: string;
};

export type JoinWorkspacePayload = {
  workspaceId: string;
  createIfMissing?: boolean;
};

export type RenameWorkspacePayload = {
  workspaceId: string;
  name: string;
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
  name: string;
  files: WorkspaceFile[];
};

export type WorkspaceStatePayload = WorkspaceState;

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

export type CollaboratorsStatePayload = {
  workspaceId: string;
  collaborators: Collaborator[];
};

export type WorkspaceRenamedPayload = {
  workspaceId: string;
  name: string;
};

export type AppErrorCode =
  | "WORKSPACE_NOT_FOUND"
  | "INVALID_WORKSPACE_NAME"
  | "FILE_NOT_FOUND"
  | "DUPLICATE_FILENAME"
  | "INVALID_FILENAME"
  | "CANNOT_DELETE_LAST_FILE"
  | "INVALID_CURSOR_POSITION"
  | "NOT_CONNECTED"
  | "FILE_OPERATION_FAILED"
  | "INTERNAL_SERVER_ERROR";

export type AppErrorPayload = {
  code: AppErrorCode;
  message: string;
  operation?: string;
  workspaceId?: string;
  fileId?: string;
};

export type OperationAck =
  | { ok: true }
  | { ok: false; error: AppErrorPayload };

export type ClientToServerEvents = {
  "join-workspace": (payload: JoinWorkspacePayload) => void;
  "leave-workspace": () => void;
  "rename-workspace": (
    payload: RenameWorkspacePayload,
    ack?: (payload: OperationAck) => void
  ) => void;
  "create-file": (
    payload: CreateFilePayload,
    ack?: (payload: OperationAck) => void
  ) => void;
  "rename-file": (
    payload: RenameFilePayload,
    ack?: (payload: OperationAck) => void
  ) => void;
  "delete-file": (
    payload: DeleteFilePayload,
    ack?: (payload: OperationAck) => void
  ) => void;
  "code-change": (payload: CodeChangePayload) => void;
  "file-selected": (payload: FileSelectedPayload) => void;
  "cursor-change": (payload: CursorChangePayload) => void;
};

export type ServerToClientEvents = {
  "workspace-state": (payload: WorkspaceStatePayload) => void;
  "workspace-renamed": (payload: WorkspaceRenamedPayload) => void;
  "file-created": (payload: FileCreatedPayload) => void;
  "file-renamed": (payload: FileRenamedPayload) => void;
  "file-deleted": (payload: FileDeletedPayload) => void;
  "code-change": (payload: CodeChangePayload) => void;
  "collaborators-state": (payload: CollaboratorsStatePayload) => void;
  "file-operation-error": (payload: AppErrorPayload) => void;
  "workspace-error": (payload: AppErrorPayload) => void;
};
