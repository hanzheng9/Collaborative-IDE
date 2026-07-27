import type {
  AppErrorPayload,
  CodeChangePayload,
  CreateFilePayload,
  CursorChangePayload,
  DeleteFilePayload,
  FileSelectedPayload,
  JoinWorkspacePayload,
  RenameFilePayload
} from "../types.js";

export function createError(
  code: AppErrorPayload["code"],
  message: string,
  details: Partial<AppErrorPayload> = {}
): AppErrorPayload {
  return {
    code,
    message,
    ...details
  };
}

export function isNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidWorkspaceId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(value)
  );
}

export function isJoinWorkspacePayload(payload: unknown): payload is JoinWorkspacePayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    isValidWorkspaceId((payload as JoinWorkspacePayload).workspaceId)
  );
}

export function isCreateFilePayload(payload: unknown): payload is CreateFilePayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    isValidWorkspaceId((payload as CreateFilePayload).workspaceId) &&
    isNonEmptyString((payload as CreateFilePayload).fileName)
  );
}

export function isRenameFilePayload(payload: unknown): payload is RenameFilePayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    isValidWorkspaceId((payload as RenameFilePayload).workspaceId) &&
    isNonEmptyString((payload as RenameFilePayload).fileId) &&
    isNonEmptyString((payload as RenameFilePayload).fileName)
  );
}

export function isDeleteFilePayload(payload: unknown): payload is DeleteFilePayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    isValidWorkspaceId((payload as DeleteFilePayload).workspaceId) &&
    isNonEmptyString((payload as DeleteFilePayload).fileId)
  );
}

export function isFileSelectedPayload(payload: unknown): payload is FileSelectedPayload {
  return isDeleteFilePayload(payload);
}

export function isCodeChangePayload(payload: unknown): payload is CodeChangePayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    isValidWorkspaceId((payload as CodeChangePayload).workspaceId) &&
    isNonEmptyString((payload as CodeChangePayload).fileId) &&
    typeof (payload as CodeChangePayload).code === "string"
  );
}

export function isCursorChangePayload(payload: unknown): payload is CursorChangePayload {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const cursorPosition = (payload as CursorChangePayload).cursorPosition;

  return (
    isValidWorkspaceId((payload as CursorChangePayload).workspaceId) &&
    isNonEmptyString((payload as CursorChangePayload).fileId) &&
    typeof cursorPosition === "object" &&
    cursorPosition !== null &&
    Number.isInteger(cursorPosition.lineNumber) &&
    Number.isInteger(cursorPosition.column) &&
    cursorPosition.lineNumber > 0 &&
    cursorPosition.column > 0
  );
}
