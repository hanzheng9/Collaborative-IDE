export type SupportedExecutionLanguage = "javascript" | "typescript" | "python";

export type ExecutionStatus =
  | "success"
  | "compile_error"
  | "runtime_error"
  | "timeout"
  | "provider_error";

export type ExecutionSourceFile = {
  content: string;
  name: string;
};

export type ExecutionProviderRequest = {
  files: ExecutionSourceFile[];
  language: SupportedExecutionLanguage;
  stdin?: string;
  timeoutMs: number;
  version?: string;
};

export type ExecutionResult = {
  compileOutput?: string;
  durationMs?: number;
  exitCode?: number;
  signal?: string;
  status: ExecutionStatus;
  stderr: string;
  stdout: string;
};

export type ExecutionRunRequest = {
  activeFileId: string;
  files: ExecutionSourceFile[];
  language: SupportedExecutionLanguage;
  stdin?: string;
  workspaceId: string;
};

export class ExecutionServiceError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 503) {
    super(message);
    this.statusCode = statusCode;
  }
}
