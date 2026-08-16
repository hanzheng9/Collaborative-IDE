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
      databaseUrl: "postgres://user:pass@example.com/db",
      port: 4100
    });
  });
});
