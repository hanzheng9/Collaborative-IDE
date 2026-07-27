import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { AiService } from "./aiService.js";
import type { AiClient } from "./aiTypes.js";

function createMockService(client: AiClient) {
  return new AiService({ client });
}

describe("AI assistant route", () => {
  it.each(["explain", "refactor", "fix", "tests", "optimize"])(
    "accepts %s action",
    async (action) => {
      const app = createApp({
        aiService: createMockService({
          async createResponse() {
            return "AI result";
          }
        })
      });

      await request(app)
        .post("/api/ai/assist")
        .send({ action, code: "const value = 1;" })
        .expect(200)
        .expect({ action, result: "AI result" });
    }
  );

  it("rejects unsupported actions", async () => {
    const app = createApp();

    await request(app)
      .post("/api/ai/assist")
      .send({ action: "delete-files", code: "const value = 1;" })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error).toMatch(/unsupported/i);
      });
  });

  it("rejects empty code", async () => {
    const app = createApp();

    await request(app)
      .post("/api/ai/assist")
      .send({ action: "explain", code: "   " })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error).toMatch(/select some code/i);
      });
  });

  it("rejects oversized code", async () => {
    const app = createApp();

    await request(app)
      .post("/api/ai/assist")
      .send({ action: "explain", code: "x".repeat(12001) })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error).toMatch(/too large/i);
      });
  });

  it("rejects malformed JSON", async () => {
    const app = createApp();

    await request(app)
      .post("/api/ai/assist")
      .set("Content-Type", "application/json")
      .send("{")
      .expect(400)
      .expect(({ body }) => {
        expect(body.error).toMatch(/malformed json/i);
      });
  });

  it("handles missing Azure configuration", async () => {
    const app = createApp({
      aiService: new AiService()
    });

    await request(app)
      .post("/api/ai/assist")
      .send({ action: "explain", code: "const value = 1;" })
      .expect(503)
      .expect(({ body }) => {
        expect(body.error).toMatch(/not configured/i);
      });
  });

  it("handles an Azure timeout without exposing provider details", async () => {
    const app = createApp({
      aiService: createMockService({
        async createResponse() {
          throw new Error("provider secret stack trace");
        }
      })
    });

    await request(app)
      .post("/api/ai/assist")
      .send({ action: "explain", code: "const value = 1;" })
      .expect(503)
      .expect(({ body }) => {
        expect(body.error).toMatch(/temporarily unavailable/i);
        expect(body.error).not.toMatch(/provider secret/i);
      });
  });

  it("handles an empty model response", async () => {
    const app = createApp({
      aiService: createMockService({
        async createResponse() {
          return "";
        }
      })
    });

    await request(app)
      .post("/api/ai/assist")
      .send({ action: "explain", code: "const value = 1;" })
      .expect(502)
      .expect(({ body }) => {
        expect(body.error).toMatch(/empty response/i);
      });
  });

  it("applies rate limiting to the AI route", async () => {
    const app = createApp({
      aiRateLimitMax: 1,
      aiRateLimitWindowMs: 60000,
      aiService: createMockService({
        async createResponse() {
          return "AI result";
        }
      })
    });

    await request(app)
      .post("/api/ai/assist")
      .send({ action: "explain", code: "const value = 1;" })
      .expect(200);
    await request(app)
      .post("/api/ai/assist")
      .send({ action: "explain", code: "const value = 1;" })
      .expect(429)
      .expect(({ body }) => {
        expect(body.error).toMatch(/too many/i);
        expect(body.error).toMatch(/try again/i);
      });
  });
});
