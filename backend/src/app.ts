import cors from "cors";
import express from "express";
import { createAiRouter, malformedJsonHandler } from "./ai/aiRouter.js";
import type { AiService } from "./ai/aiService.js";
import { createExecutionRouter } from "./execution/executionRouter.js";
import type { ExecutionService } from "./execution/executionService.js";

type CreateAppOptions = {
  aiRateLimitMax?: number;
  aiRateLimitWindowMs?: number;
  aiService?: AiService;
  executionRateLimitMax?: number;
  executionRateLimitWindowMs?: number;
  executionService?: ExecutionService;
};

export function createApp(options: CreateAppOptions = {}) {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(malformedJsonHandler);
  app.use(
    "/api/ai",
    createAiRouter({
      rateLimitMax: options.aiRateLimitMax,
      rateLimitWindowMs: options.aiRateLimitWindowMs,
      service: options.aiService
    })
  );
  if (options.executionService) {
    app.use(
      "/api/execution",
      createExecutionRouter({
        rateLimitMax: options.executionRateLimitMax,
        rateLimitWindowMs: options.executionRateLimitWindowMs,
        service: options.executionService
      })
    );
  }

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  return app;
}
