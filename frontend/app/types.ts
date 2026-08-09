export type {
  AppErrorCode,
  AppErrorPayload,
  ClientToServerEvents,
  CodeChangePayload,
  Collaborator,
  CollaboratorsStatePayload,
  CreateFilePayload,
  CursorChangePayload,
  CursorPosition,
  DeleteFilePayload,
  FileCreatedPayload,
  FileDeletedPayload,
  FileRenamedPayload,
  FileSelectedPayload,
  JoinWorkspacePayload,
  OperationAck,
  RenameFilePayload,
  RenameWorkspacePayload,
  ServerToClientEvents,
  WorkspaceFile,
  WorkspaceRenamedPayload,
  WorkspaceState,
  WorkspaceStatePayload
} from "@collaborative-ide/shared";

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
