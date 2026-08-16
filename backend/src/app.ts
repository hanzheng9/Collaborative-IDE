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
  corsOrigin?: string;
  executionDailyRateLimitMax?: number;
  executionDailyRateLimitWindowMs?: number;
  executionRateLimitMax?: number;
  executionRateLimitWindowMs?: number;
  executionService?: ExecutionService;
  getHealthServices?: () => HealthServices;
};

type ServiceStatus = "configured" | "not_configured" | "unavailable";

type HealthServices = {
  ai: ServiceStatus;
  database: ServiceStatus;
  execution: ServiceStatus;
};

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const corsOrigin = options.corsOrigin ?? "http://localhost:3000";

  app.use(cors({ origin: corsOrigin }));
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
        dailyRateLimitMax: options.executionDailyRateLimitMax,
        dailyRateLimitWindowMs: options.executionDailyRateLimitWindowMs,
        rateLimitMax: options.executionRateLimitMax,
        rateLimitWindowMs: options.executionRateLimitWindowMs,
        service: options.executionService
      })
    );
  }

  app.get("/health", (_request, response) => {
    response.json({
      services: options.getHealthServices?.() ?? {
        ai: options.aiService?.isConfigured() ? "configured" : "not_configured",
        database: "not_configured",
        execution: options.executionService?.isConfigured()
          ? "configured"
          : "not_configured"
      },
      status: "ok"
    });
  });

  return app;
}
