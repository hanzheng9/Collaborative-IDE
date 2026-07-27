import { logger } from "../logger.js";
import type { ExecutionProvider } from "./executionProvider.js";
import type {
  ExecutionProviderRequest,
  ExecutionResult
} from "./executionTypes.js";

type PistonStage = {
  code?: number | null;
  output?: string;
  signal?: string | null;
  stderr?: string;
  stdout?: string;
};

type PistonResponse = {
  compile?: PistonStage;
  run?: PistonStage;
};

type PistonExecutionProviderOptions = {
  apiKey?: string;
  apiUrl: string;
  requestTimeoutMs?: number;
};

function isPistonResponse(value: unknown): value is PistonResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "run" in value &&
    typeof (value as PistonResponse).run === "object"
  );
}

function getStageOutput(stage: PistonStage | undefined) {
  return {
    output: stage?.output ?? "",
    stderr: stage?.stderr ?? "",
    stdout: stage?.stdout ?? ""
  };
}

function normalizePistonResponse(
  response: PistonResponse,
  durationMs: number
): ExecutionResult {
  const compileOutput = getStageOutput(response.compile);
  const runOutput = getStageOutput(response.run);
  const compileText = [
    compileOutput.stdout,
    compileOutput.stderr,
    compileOutput.output
  ]
    .filter(Boolean)
    .join("");
  const stdout = runOutput.stdout || runOutput.output;
  const stderr = runOutput.stderr;
  const exitCode = response.run?.code ?? undefined;
  const signal = response.run?.signal ?? undefined;

  if (signal && /timeout|killed|sigkill/i.test(signal)) {
    return {
      compileOutput: compileText || undefined,
      durationMs,
      exitCode,
      signal,
      status: "timeout",
      stderr,
      stdout
    };
  }

  if (compileText && response.compile?.code !== 0) {
    return {
      compileOutput: compileText,
      durationMs,
      exitCode: response.compile?.code ?? undefined,
      signal: response.compile?.signal ?? undefined,
      status: "compile_error",
      stderr,
      stdout
    };
  }

  if (exitCode && exitCode !== 0) {
    return {
      compileOutput: compileText || undefined,
      durationMs,
      exitCode,
      signal,
      status: "runtime_error",
      stderr,
      stdout
    };
  }

  return {
    compileOutput: compileText || undefined,
    durationMs,
    exitCode,
    signal,
    status: "success",
    stderr,
    stdout
  };
}

export class PistonExecutionProvider implements ExecutionProvider {
  private readonly apiKey?: string;
  private readonly executeUrl: string;
  private readonly requestTimeoutMs: number;

  constructor(options: PistonExecutionProviderOptions) {
    this.apiKey = options.apiKey;
    const apiUrl = options.apiUrl.replace(/\/+$/, "");
    this.executeUrl = apiUrl.endsWith("/execute")
      ? apiUrl
      : `${apiUrl}/execute`;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 7000;
  }

  async run(
    request: ExecutionProviderRequest,
    signal?: AbortSignal
  ): Promise<ExecutionResult> {
    const startedAt = Date.now();
    const timeoutController = new AbortController();
    const requestController = new AbortController();
    const abortRequest = () => {
      requestController.abort();
    };
    const timeout = setTimeout(() => {
      timeoutController.abort();
      abortRequest();
    }, this.requestTimeoutMs);
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    signal?.addEventListener("abort", abortRequest, { once: true });

    try {
      const response = await fetch(this.executeUrl, {
        body: JSON.stringify({
          compile_timeout: request.timeoutMs,
          files: request.files,
          language: request.language,
          run_memory_limit: 256 * 1024 * 1024,
          run_timeout: request.timeoutMs,
          stdin: request.stdin ?? "",
          version: request.version
        }),
        headers,
        method: "POST",
        signal: requestController.signal
      });

      if (response.status === 429) {
        return {
          status: "provider_error",
          stderr: "Execution provider rate limit reached.",
          stdout: ""
        };
      }

      if (!response.ok) {
        logger.warn("execution provider returned non-success status", {
          statusCode: response.status
        });
        return {
          status: "provider_error",
          stderr: "Execution provider is unavailable.",
          stdout: ""
        };
      }

      const body: unknown = await response.json();

      if (!isPistonResponse(body)) {
        return {
          status: "provider_error",
          stderr: "Execution provider returned an invalid response.",
          stdout: ""
        };
      }

      return normalizePistonResponse(body, Date.now() - startedAt);
    } catch (error) {
      if (timeoutController.signal.aborted) {
        return {
          durationMs: Date.now() - startedAt,
          status: "timeout",
          stderr: "Execution timed out.",
          stdout: ""
        };
      }

      return {
        status: "provider_error",
        stderr: "Execution provider is unavailable.",
        stdout: ""
      };
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortRequest);
    }
  }
}
