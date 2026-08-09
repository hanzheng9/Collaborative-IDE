import { createHash } from "node:crypto";
import { logger } from "../logger.js";
import { WorkspaceService } from "../services/workspaceService.js";
import type { WorkspaceFile } from "../types.js";
import type { ExecutionProvider } from "./executionProvider.js";
import {
  ExecutionServiceError,
  type ExecutionResult,
  type ExecutionRunRequest,
  type ExecutionSourceFile
} from "./executionTypes.js";
import { executionLimits, truncateOutput } from "./executionValidation.js";
import { getRuntime } from "./languageRegistry.js";
import { Judge0ExecutionProvider } from "./judge0ExecutionProvider.js";
import { PistonExecutionProvider } from "./pistonExecutionProvider.js";
import { incrementExecutionUsage } from "../database.js";

type ExecutionServiceOptions = {
  provider?: ExecutionProvider;
  workspaceService: WorkspaceService;
};

function createDefaultProvider() {
  const provider = process.env.CODE_EXECUTION_PROVIDER ?? "piston";
  const configuredMonthlyLimit = Number(process.env.JUDGE0_MONTHLY_EXECUTION_LIMIT);
  const monthlyLimit =
    Number.isFinite(configuredMonthlyLimit) && configuredMonthlyLimit > 0
      ? configuredMonthlyLimit
      : 1500;

  if (provider === "judge0") {
    const apiKey = process.env.JUDGE0_API_KEY;
    const apiUrl = process.env.JUDGE0_API_URL;

    if (!apiKey || !apiUrl) {
      logger.warn("code execution disabled", {
        missingVariables: [
          !apiKey ? "JUDGE0_API_KEY" : "",
          !apiUrl ? "JUDGE0_API_URL" : ""
        ].filter(Boolean).join(","),
        provider
      });
      return null;
    }

    return new Judge0ExecutionProvider({
      apiHost: process.env.JUDGE0_API_HOST,
      apiKey,
      apiUrl,
      monthlyLimit,
      requestTimeoutMs: executionLimits.timeoutMs + 5000,
      reserveMonthlyExecution: () =>
        incrementExecutionUsage(new Date().toISOString().slice(0, 7), monthlyLimit)
    });
  }

  if (provider !== "piston") {
    logger.warn("code execution disabled", {
      provider
    });
    return null;
  }

  return new PistonExecutionProvider({
    apiKey: process.env.PISTON_API_KEY,
    apiUrl: process.env.PISTON_API_URL ?? "https://emkc.org/api/v2/piston",
    requestTimeoutMs: executionLimits.timeoutMs + 2500
  });
}

function sanitizeResult(result: ExecutionResult): ExecutionResult {
  return {
    ...result,
    compileOutput: result.compileOutput
      ? truncateOutput(result.compileOutput)
      : undefined,
    stderr: truncateOutput(result.stderr),
    stdout: truncateOutput(result.stdout),
    status:
      result.status === "provider_error" ? "provider_error" : result.status
  };
}

export class ExecutionService {
  private readonly pendingRuns = new Map<string, Promise<ExecutionResult>>();
  private readonly provider: ExecutionProvider | null;
  private readonly workspaceService: WorkspaceService;

  constructor(options: ExecutionServiceOptions) {
    this.provider = options.provider ?? createDefaultProvider();
    this.workspaceService = options.workspaceService;
  }

  isConfigured() {
    return Boolean(this.provider);
  }

  async run(
    request: ExecutionRunRequest,
    signal?: AbortSignal
  ): Promise<ExecutionResult> {
    if (!this.provider) {
      throw new ExecutionServiceError("Code execution is not configured.", 503);
    }

    await this.workspaceService.loadWorkspace(request.workspaceId);
    const workspaceState = this.workspaceService.getWorkspaceState(
      request.workspaceId
    );
    const activeFile = workspaceState.files.find(
      (file) => file.fileId === request.activeFileId
    );

    if (!activeFile) {
      throw new ExecutionServiceError(
        "The active file does not belong to this workspace.",
        400
      );
    }

    const providerFiles = this.buildProviderFiles(
      workspaceState.files,
      activeFile,
      request.files
    );
    const runtime = getRuntime(request.language);
    const providerRequest = {
      files: providerFiles,
      judge0LanguageId: runtime.judge0LanguageId,
      language: runtime.providerLanguage,
      stdin: request.stdin,
      timeoutMs: executionLimits.timeoutMs,
      version: runtime.version
    };
    const runKey = this.getRunKey(providerRequest);
    const pendingRun = this.pendingRuns.get(runKey);

    if (pendingRun) {
      return pendingRun;
    }

    const startedAt = Date.now();
    const runPromise = this.provider
      .run(providerRequest, signal)
      .then(sanitizeResult)
      .then((result) => {
        logger.info("code execution completed", {
          durationMs: Date.now() - startedAt,
          language: request.language,
          status: result.status
        });
        return result;
      })
      .catch(() => {
        throw new ExecutionServiceError(
          "Execution service is temporarily unavailable.",
          503
        );
      })
      .finally(() => {
        this.pendingRuns.delete(runKey);
      });

    this.pendingRuns.set(runKey, runPromise);
    return runPromise;
  }

  private buildProviderFiles(
    workspaceFiles: WorkspaceFile[],
    activeFile: WorkspaceFile,
    submittedFiles: ExecutionSourceFile[]
  ) {
    const submittedByName = new Map(
      submittedFiles.map((file) => [file.name, file.content])
    );
    const activeContent = submittedByName.get(activeFile.fileName) ?? activeFile.content;

    if (activeContent.trim().length === 0) {
      throw new ExecutionServiceError("The active source file cannot be empty.", 400);
    }

    const activeProviderFile = {
      content: activeContent,
      name: activeFile.fileName
    };
    const otherFiles = workspaceFiles
      .filter((file) => file.fileId !== activeFile.fileId)
      .slice(0, executionLimits.maxFiles - 1)
      .map((file) => ({
        content: submittedByName.get(file.fileName) ?? file.content,
        name: file.fileName
      }));

    return [activeProviderFile, ...otherFiles];
  }

  private getRunKey(request: object) {
    return createHash("sha256").update(JSON.stringify(request)).digest("hex");
  }
}
