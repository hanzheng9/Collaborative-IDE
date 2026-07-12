import type { WorkspaceFile } from "./types.js";

export type FilenameValidationResult =
  | { ok: true; fileName: string }
  | { ok: false; error: string };

export function validateFileName(
  fileName: string,
  files: Iterable<WorkspaceFile>,
  currentFileId?: string
): FilenameValidationResult {
  const trimmedName = fileName.trim();

  if (!trimmedName) {
    return { ok: false, error: "Filename is required." };
  }

  const duplicateFile = Array.from(files).some(
    (file) =>
      file.fileId !== currentFileId &&
      file.fileName.trim().toLowerCase() === trimmedName.toLowerCase()
  );

  if (duplicateFile) {
    return { ok: false, error: "A file with that name already exists." };
  }

  return { ok: true, fileName: trimmedName };
}
