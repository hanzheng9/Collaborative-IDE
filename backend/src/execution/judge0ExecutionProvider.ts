import { logger } from "../logger.js";
import type { ExecutionProvider } from "./executionProvider.js";
import type {
  ExecutionProviderRequest,
  ExecutionResult
} from "./executionTypes.js";

type Judge0ExecutionProviderOptions = {
  apiHost?: string;
  apiKey: string;
  apiUrl: string;
  monthlyLimit?: number;
  requestTimeoutMs?: number;
  reserveMonthlyExecution?: () => Promise<{ allowed: boolean; executionCount: number }>;
};

type Judge0SubmissionResponse = {
  token?: string;
};

type Judge0Status = {
  description?: string;
  id?: number;
};

type Judge0ResultResponse = {
  compile_output?: string | null;
  exit_code?: number | null;
  message?: string | null;
  status?: Judge0Status;
  stderr?: string | null;
  stdout?: string | null;
  time?: string | null;
};

const defaultPollIntervalMs = 700;
const defaultRequestTimeoutMs = 8000;
const monthlyLimitMessage =
  "Monthly execution limit reached.\n\nTo keep the public demo available, code execution has been temporarily disabled.\n\nThe limit resets automatically at the beginning of next month.";

function getDurationMs(startedAt: number, judge0Time?: string | null) {
  const parsedSeconds = Number(judge0Time);

  if (Number.isFinite(parsedSeconds) && parsedSeconds >= 0) {
    return Math.round(parsedSeconds * 1000);
  }

  return Date.now() - startedAt;
}

function getMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function isSubmissionResponse(value: unknown): value is Judge0SubmissionResponse {
  return typeof value === "object" && value !== null && "token" in value;
}

function normalizeJudge0Response(
  response: Judge0ResultResponse,
  startedAt: number
): ExecutionResult {
  const statusId = response.status?.id;
  const stderr = response.stderr ?? response.message ?? "";
  const stdout = response.stdout ?? "";
  const compileOutput = response.compile_output ?? undefined;
  const durationMs = getDurationMs(startedAt, response.time);
  const exitCode = response.exit_code ?? undefined;

  if (statusId === 5) {
    return {
      compileOutput,
      durationMs,
      exitCode,
      status: "timeout",
      stderr: stderr || "Execution timed out.",
      stdout
    };
  }

  if (statusId === 6) {
    return {
      compileOutput,
      durationMs,
      exitCode,
      status: "compile_error",
      stderr,
      stdout
    };
  }

  if (statusId && statusId >= 7) {
    return {
      compileOutput,
      durationMs,
      exitCode,
      status: "runtime_error",
      stderr: stderr || response.status?.description || "Runtime error.",
      stdout
    };
  }

  return {
    compileOutput,
    durationMs,
    exitCode,
    status: "success",
    stderr,
    stdout
  };
}

export class Judge0ExecutionProvider implements ExecutionProvider {
  private readonly apiHost?: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly monthlyLimit: number;
  private readonly requestTimeoutMs: number;
  private readonly reserveMonthlyExecution?: () => Promise<{
    allowed: boolean;
    executionCount: number;
  }>;

  constructor(options: Judge0ExecutionProviderOptions) {
    this.apiHost = options.apiHost;
    this.apiKey = options.apiKey;
    this.baseUrl = options.apiUrl.replace(/\/+$/, "");
    this.monthlyLimit = options.monthlyLimit ?? 1500;
    this.requestTimeoutMs = options.requestTimeoutMs ?? defaultRequestTimeoutMs;
    this.reserveMonthlyExecution = options.reserveMonthlyExecution;
  }

  async run(
    request: ExecutionProviderRequest,
    signal?: AbortSignal
  ): Promise<ExecutionResult> {
    const startedAt = Date.now();
    const languageId = request.judge0LanguageId;

    if (!languageId) {
      return {
        status: "provider_error",
        stderr: "Unsupported language for production code execution.",
        stdout: ""
      };
    }

    // Reserve usage immediately before the paid provider request. If Judge0/RapidAPI
    // rejects after this point, keep the count conservative and do not retry.
    const usage = await this.reserveMonthlyExecution?.();

    if (usage && !usage.allowed) {
      logger.warn("Judge0 monthly execution limit reached", {
        limit: this.monthlyLimit,
        monthKey: getMonthKey()
      });
      return {
        status: "provider_error",
        stderr: monthlyLimitMessage,
        stdout: ""
      };
    }

    const timeoutController = new AbortController();
    const requestController = new AbortController();
    const abortRequest = () => {
      requestController.abort();
    };
    const timeout = setTimeout(() => {
      timeoutController.abort();
      abortRequest();
    }, this.requestTimeoutMs);

    signal?.addEventListener("abort", abortRequest, { once: true });

    try {
      const token = await this.submit(request, languageId, requestController.signal);
      const result = await this.poll(token, requestController.signal);
      return normalizeJudge0Response(result, startedAt);
    } catch (error) {
      if (timeoutController.signal.aborted) {
        return {
          durationMs: Date.now() - startedAt,
          status: "timeout",
          stderr: "Execution timed out.",
          stdout: ""
        };
      }

      logger.warn("Judge0 execution request failed", {
        error: error instanceof Error ? error.message : "unknown"
      });
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

  private getHeaders() {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-RapidAPI-Key": this.apiKey
    };

    if (this.apiHost) {
      headers["X-RapidAPI-Host"] = this.apiHost;
    }

    return headers;
  }

  private async submit(
    request: ExecutionProviderRequest,
    languageId: number,
    signal: AbortSignal
  ) {
    const response = await fetch(
      `${this.baseUrl}/submissions?base64_encoded=false&wait=false`,
      {
        body: JSON.stringify({
          cpu_time_limit: Math.max(1, Math.ceil(request.timeoutMs / 1000)),
          language_id: languageId,
          source_code: request.files[0]?.content ?? "",
          stdin: request.stdin ?? ""
        }),
        headers: this.getHeaders(),
        method: "POST",
        signal
      }
    );

    if (!response.ok) {
      throw new Error(`Judge0 submit failed with ${response.status}`);
    }

    const body: unknown = await response.json();

    if (!isSubmissionResponse(body) || !body.token) {
      throw new Error("Judge0 submit returned no token");
    }

    return body.token;
  }

  private async poll(token: string, signal: AbortSignal) {
    while (!signal.aborted) {
      const response = await fetch(
        `${this.baseUrl}/submissions/${token}?base64_encoded=false`,
        {
          headers: this.getHeaders(),
          method: "GET",
          signal
        }
      );

      if (!response.ok) {
        throw new Error(`Judge0 poll failed with ${response.status}`);
      }

      const body = (await response.json()) as Judge0ResultResponse;
      const statusId = body.status?.id;

      if (statusId !== 1 && statusId !== 2) {
        return body;
      }

      await new Promise((resolve) => setTimeout(resolve, defaultPollIntervalMs));
    }

    throw new Error("Judge0 request aborted");
  }
}
