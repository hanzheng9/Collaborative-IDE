import { getBackendUrl } from "./backendUrl";
import type { WorkspaceFile } from "./types";

export type ExecutionStatus =
  | "success"
  | "compile_error"
  | "runtime_error"
  | "timeout";

export type ExecutionResult = {
  compileOutput?: string;
  durationMs?: number;
  exitCode?: number;
  signal?: string;
  status: ExecutionStatus;
  stderr: string;
  stdout: string;
};

export const executableLanguages = ["javascript", "typescript", "python"] as const;

export function isExecutableLanguage(language: string) {
  return executableLanguages.includes(
    language as (typeof executableLanguages)[number]
  );
}

export async function runCode(
  workspaceId: string,
  selectedFile: WorkspaceFile,
  files: WorkspaceFile[],
  stdin: string,
  signal: AbortSignal
) {
  const response = await fetch(getBackendUrl("/api/execution/run"), {
    body: JSON.stringify({
      activeFileId: selectedFile.fileId,
      files: files.map((file) => ({
        content: file.content,
        name: file.fileName
      })),
      language: selectedFile.language,
      stdin,
      workspaceId
    }),
    credentials: "omit",
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST",
    signal
  });
  const body = (await response.json()) as Partial<ExecutionResult> & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error ?? "Code execution failed.");
  }

  if (!body.status || body.stdout === undefined || body.stderr === undefined) {
    throw new Error("Execution service returned an invalid response.");
  }

  return body as ExecutionResult;
}

export function getExecutionStatusLabel(status: ExecutionStatus) {
  switch (status) {
    case "compile_error":
      return "Compilation failed";
    case "runtime_error":
      return "Runtime error";
    case "success":
      return "Completed successfully";
    case "timeout":
      return "Execution timed out";
  }
}
