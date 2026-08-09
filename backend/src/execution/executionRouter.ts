import { Router } from "express";
import type { Response } from "express";
import rateLimit from "express-rate-limit";
import { logger } from "../logger.js";
import { ExecutionService } from "./executionService.js";
import { ExecutionServiceError } from "./executionTypes.js";
import { validateExecutionRequest } from "./executionValidation.js";

type ExecutionRouterOptions = {
  dailyRateLimitMax?: number;
  dailyRateLimitWindowMs?: number;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  service: ExecutionService;
};

function getPositiveNumber(value: string | undefined, fallback: number) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

const executionLimitMessage =
  "Execution limit reached.\n\nTo keep the public demo reliable, code execution is temporarily unavailable.\n\nPlease try again later.";

export function createExecutionRouter(options: ExecutionRouterOptions) {
  const router = Router();
  const rateLimitMax =
    options.rateLimitMax ??
    getPositiveNumber(process.env.EXECUTION_RATE_LIMIT_MAX, 20);
  const rateLimitWindowMs =
    options.rateLimitWindowMs ??
    getPositiveNumber(process.env.EXECUTION_RATE_LIMIT_WINDOW_MS, 60 * 60 * 1000);
  const dailyRateLimitMax =
    options.dailyRateLimitMax ??
    getPositiveNumber(process.env.EXECUTION_DAILY_RATE_LIMIT_MAX, 100);
  const dailyRateLimitWindowMs =
    options.dailyRateLimitWindowMs ??
    getPositiveNumber(process.env.EXECUTION_DAILY_RATE_LIMIT_WINDOW_MS, 24 * 60 * 60 * 1000);
  const createLimitHandler = () => {
    return (_request: unknown, response: Response) => {
      response.status(429).json({
        error: executionLimitMessage
      });
    };
  };
  const hourlyLimiter = rateLimit({
    handler: createLimitHandler(),
    legacyHeaders: false,
    max: rateLimitMax,
    standardHeaders: true,
    windowMs: rateLimitWindowMs
  });
  const dailyLimiter = rateLimit({
    handler: createLimitHandler(),
    legacyHeaders: false,
    max: dailyRateLimitMax,
    standardHeaders: true,
    windowMs: dailyRateLimitWindowMs
  });

  router.post("/run", hourlyLimiter, dailyLimiter, async (request, response) => {
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
        if (/monthly execution limit reached/i.test(result.stderr)) {
          response.status(429).json({
            error: result.stderr
          });
          return;
        }

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
