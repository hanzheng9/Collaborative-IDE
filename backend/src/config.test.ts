import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const originalEnv = { ...process.env };

describe("loadConfig", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("cleans quoted deployment environment values", () => {
    process.env.CORS_ORIGIN = '"https://frontend.example.com/"';
    process.env.DATABASE_URL = "'postgres://user:pass@example.com/db'";
    process.env.PORT = '"4100"';

    expect(loadConfig()).toEqual({
      corsOrigin: "https://frontend.example.com",
      corsOrigins: [
        "https://frontend.example.com",
        "http://localhost:3000"
      ],
      databaseUrl: "postgres://user:pass@example.com/db",
      port: 4100,
      rateLimits: {
        aiPerHour: 20,
        codeExecutionPerHour: 20,
        generalRestPerMinute: 120,
        socketConnectionsPerMinute: 40,
        workspaceCreatePerHour: 20
      },
      trustProxy: 1
    });
  });

  it("uses only the configured CORS origin in production", () => {
    process.env.CORS_ORIGIN = "https://frontend.example.com";
    process.env.NODE_ENV = "production";

    expect(loadConfig().corsOrigins).toEqual(["https://frontend.example.com"]);
  });

  it("loads production rate-limit configuration", () => {
    process.env.RATE_LIMIT_GENERAL_PER_MINUTE = "60";
    process.env.RATE_LIMIT_AI_PER_HOUR = "8";
    process.env.RATE_LIMIT_EXECUTION_PER_HOUR = "9";
    process.env.RATE_LIMIT_WORKSPACE_CREATE_PER_HOUR = "10";
    process.env.RATE_LIMIT_SOCKET_CONNECTIONS_PER_MINUTE = "11";
    process.env.TRUST_PROXY_HOPS = "2";

    expect(loadConfig()).toMatchObject({
      rateLimits: {
        aiPerHour: 8,
        codeExecutionPerHour: 9,
        generalRestPerMinute: 60,
        socketConnectionsPerMinute: 11,
        workspaceCreatePerHour: 10
      },
      trustProxy: 2
    });
  });

  it("keeps backward-compatible AI and execution rate-limit names", () => {
    process.env.AI_RATE_LIMIT_MAX = "6";
    process.env.EXECUTION_RATE_LIMIT_MAX = "7";

    expect(loadConfig().rateLimits).toMatchObject({
      aiPerHour: 6,
      codeExecutionPerHour: 7
    });
  });
});
