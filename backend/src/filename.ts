import type { WorkspaceFile } from "./types.js";
import type { AppErrorPayload } from "./types.js";

export type FilenameValidationResult =
  | { ok: true; fileName: string }
  | {
      ok: false;
      code: Extract<AppErrorPayload["code"], "INVALID_FILENAME" | "DUPLICATE_FILENAME">;
      error: string;
    };

export function validateFileName(
  fileName: string,
  files: Iterable<WorkspaceFile>,
  currentFileId?: string
): FilenameValidationResult {
  const trimmedName = fileName.trim();

  if (!trimmedName) {
    return {
      ok: false,
      error: "Filename is required.",
      code: "INVALID_FILENAME" as const
    };
  }

  const duplicateFile = Array.from(files).some(
    (file) =>
      file.fileId !== currentFileId &&
      file.fileName.trim().toLowerCase() === trimmedName.toLowerCase()
  );

  if (duplicateFile) {
    return {
      ok: false,
      error: "A file with that name already exists.",
      code: "DUPLICATE_FILENAME" as const
    };
  }

  return { ok: true, fileName: trimmedName };
}
