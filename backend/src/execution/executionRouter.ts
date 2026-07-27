import { Router } from "express";
import type { Request } from "express";
import rateLimit from "express-rate-limit";
import { logger } from "../logger.js";
import { ExecutionService } from "./executionService.js";
import { ExecutionServiceError } from "./executionTypes.js";
import { validateExecutionRequest } from "./executionValidation.js";

type ExecutionRouterOptions = {
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  service: ExecutionService;
};

type RateLimitedRequest = Request & {
  rateLimit?: {
    resetTime?: Date;
  };
};

function getPositiveNumber(value: string | undefined, fallback: number) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

function getRetryMessage(request: RateLimitedRequest) {
  const resetTime = request.rateLimit?.resetTime?.getTime();

  if (!resetTime) {
    return "Too many code executions. Try again shortly.";
  }

  const retrySeconds = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));

  if (retrySeconds < 60) {
    return `Too many code executions. Try again in about ${retrySeconds} seconds.`;
  }

  return `Too many code executions. Try again in about ${Math.ceil(
    retrySeconds / 60
  )} minutes.`;
}

export function createExecutionRouter(options: ExecutionRouterOptions) {
  const router = Router();
  const rateLimitMax =
    options.rateLimitMax ??
    getPositiveNumber(process.env.EXECUTION_RATE_LIMIT_MAX, 10);
  const rateLimitWindowMs =
    options.rateLimitWindowMs ??
    getPositiveNumber(process.env.EXECUTION_RATE_LIMIT_WINDOW_MS, 5 * 60 * 1000);
  const limiter = rateLimit({
    handler(request, response) {
      response.status(429).json({
        error: getRetryMessage(request as RateLimitedRequest)
      });
    },
    legacyHeaders: false,
    max: rateLimitMax,
    standardHeaders: true,
    windowMs: rateLimitWindowMs
  });

  router.post("/run", limiter, async (request, response) => {
    const validation = validateExecutionRequest(request.body);

    if (!validation.ok) {
      response.status(400).json({ error: validation.error });
      return;
    }

    const abortController = new AbortController();
    request.on("aborted", () => {
      abortController.abort();
    });

    try {
      const result = await options.service.run(
        validation.request,
        abortController.signal
      );

      if (result.status === "provider_error") {
        response.status(503).json({
          error: "Execution service is unavailable."
        });
        return;
      }

      response.json(result);
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }

      const statusCode =
        error instanceof ExecutionServiceError ? error.statusCode : 503;
      const message =
        error instanceof ExecutionServiceError
          ? error.message
          : "Execution service is temporarily unavailable.";

      logger.warn("execution route failed", {
        statusCode
      });
      response.status(statusCode).json({ error: message });
    }
  });

  return router;
}
