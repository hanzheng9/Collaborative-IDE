import { isValidWorkspaceId } from "../validation/socketValidation.js";
import {
  isSupportedExecutionLanguage
} from "./languageRegistry.js";
import type {
  ExecutionRunRequest,
  ExecutionSourceFile
} from "./executionTypes.js";

export const executionLimits = {
  maxFiles: 20,
  maxFileSize: 60 * 1024,
  maxOutputSize: 50 * 1024,
  maxSourceSize: 100 * 1024,
  maxStdinSize: 10 * 1024,
  timeoutMs: 3000
};

type ValidationResult =
  | { ok: true; request: ExecutionRunRequest }
  | { ok: false; error: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeFileName(fileName: string) {
  const normalizedFileName = fileName.toLowerCase();

  return (
    fileName.length <= 240 &&
    !fileName.startsWith(".") &&
    !fileName.includes("..") &&
    !fileName.includes("/") &&
    !fileName.includes("\\") &&
    !fileName.includes("\0") &&
    normalizedFileName !== ".env" &&
    !/(^|[._-])(env|secret|secrets|credential|credentials|token|tokens|api-key|apikey)([._-]|$)/i.test(
      fileName
    )
  );
}

function validateFiles(files: unknown): { error: string } | { files: ExecutionSourceFile[] } {
  if (!Array.isArray(files) || files.length === 0) {
    return { error: "At least one source file is required." };
  }

  if (files.length > executionLimits.maxFiles) {
    return { error: `A maximum of ${executionLimits.maxFiles} files can be run.` };
  }

  const sourceFiles: ExecutionSourceFile[] = [];
  let totalSize = 0;

  for (const item of files) {
    if (typeof item !== "object" || item === null) {
      return { error: "Each submitted file must be an object." };
    }

    const record = item as Record<string, unknown>;
    const fileName = isNonEmptyString(record.name)
      ? record.name.trim()
      : "";

    if (!fileName || !isSafeFileName(fileName)) {
      return { error: "Submitted file names must be safe source filenames." };
    }

    if (typeof record.content !== "string") {
      return { error: "Submitted file content must be text." };
    }

    if (record.content.length > executionLimits.maxFileSize) {
      return { error: "One submitted file is too large to run." };
    }

    totalSize += record.content.length;

    if (totalSize > executionLimits.maxSourceSize) {
      return { error: "Submitted source is too large to run." };
    }

    sourceFiles.push({
      content: record.content,
      name: fileName
    });
  }

  return { files: sourceFiles };
}

export function validateExecutionRequest(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;

  if (!isValidWorkspaceId(record.workspaceId)) {
    return { ok: false, error: "Missing or invalid workspace ID." };
  }

  const activeFileId = isNonEmptyString(record.activeFileId)
    ? record.activeFileId.trim()
    : "";
  const workspaceId = isValidWorkspaceId(record.workspaceId)
    ? record.workspaceId
    : "";

  if (!activeFileId) {
    return { ok: false, error: "Missing active file ID." };
  }

  if (!isSupportedExecutionLanguage(record.language)) {
    return { ok: false, error: "Unsupported language for code execution." };
  }

  const filesResult = validateFiles(record.files);

  if ("error" in filesResult) {
    return { ok: false, error: filesResult.error };
  }

  if (
    record.stdin !== undefined &&
    (typeof record.stdin !== "string" ||
      record.stdin.length > executionLimits.maxStdinSize)
  ) {
    return { ok: false, error: "Standard input is too large." };
  }

  return {
    ok: true,
    request: {
      activeFileId,
      files: filesResult.files,
      language: record.language,
      stdin: typeof record.stdin === "string" ? record.stdin : undefined,
      workspaceId
    }
  };
}

export function truncateOutput(value: string) {
  if (value.length <= executionLimits.maxOutputSize) {
    return value;
  }

  return `${value.slice(0, executionLimits.maxOutputSize)}\nOutput truncated.`;
}
