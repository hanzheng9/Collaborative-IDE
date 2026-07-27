import { Router, type ErrorRequestHandler } from "express";
import type { Request } from "express";
import rateLimit from "express-rate-limit";
import { logger } from "../logger.js";
import { AiService } from "./aiService.js";
import { AiServiceError } from "./aiTypes.js";
import { validateAiAssistRequest } from "./aiValidation.js";

type AiRouterOptions = {
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  service?: AiService;
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
    return "Too many AI requests. Try again shortly.";
  }

  const retrySeconds = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));

  if (retrySeconds < 60) {
    return `Too many AI requests. Try again in about ${retrySeconds} seconds.`;
  }

  return `Too many AI requests. Try again in about ${Math.ceil(
    retrySeconds / 60
  )} minutes.`;
}

export function createAiRouter(options: AiRouterOptions = {}) {
  const router = Router();
  const service = options.service ?? new AiService();
  const rateLimitMax =
    options.rateLimitMax ??
    getPositiveNumber(process.env.AI_RATE_LIMIT_MAX, 20);
  const rateLimitWindowMs =
    options.rateLimitWindowMs ??
    getPositiveNumber(process.env.AI_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000);
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

  router.post("/assist", limiter, async (request, response) => {
    const validation = validateAiAssistRequest(request.body);

    if (!validation.ok) {
      response.status(400).json({ error: validation.error });
      return;
    }

    const abortController = new AbortController();
    request.on("aborted", () => {
      abortController.abort();
    });

    try {
      const result = await service.assist(validation.request, abortController.signal);
      response.json(result);
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }

      const statusCode =
        error instanceof AiServiceError ? error.statusCode : 503;
      const message =
        error instanceof AiServiceError
          ? error.message
          : "AI assistant is temporarily unavailable.";

      logger.warn("AI route failed", {
        action: validation.request.action,
        statusCode
      });
      response.status(statusCode).json({ error: message });
    }
  });

  return router;
}

export const malformedJsonHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  next
) => {
  if (error instanceof SyntaxError && "body" in error) {
    response.status(400).json({ error: "Malformed JSON request body." });
    return;
  }

  next(error);
};
