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
      port: 4100
    });
  });

  it("uses only the configured CORS origin in production", () => {
    process.env.CORS_ORIGIN = "https://frontend.example.com";
    process.env.NODE_ENV = "production";

    expect(loadConfig().corsOrigins).toEqual(["https://frontend.example.com"]);
  });
});
