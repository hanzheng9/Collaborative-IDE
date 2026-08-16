import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("Express app", () => {
  it("responds to GET /health", async () => {
    await request(createApp())
      .get("/health")
      .expect(200)
      .expect("Content-Type", /json/)
      .expect({
        services: {
          ai: "not_configured",
          database: "not_configured",
          execution: "not_configured"
        },
        status: "ok"
      });
  });

  it("uses the configured CORS origin", async () => {
    const response = await request(
      createApp({ corsOrigin: "https://frontend.example.com" })
    )
      .get("/health")
      .set("Origin", "https://frontend.example.com")
      .expect(200);

    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://frontend.example.com"
    );
  });

  it("returns 404 for unknown endpoints", async () => {
    await request(createApp()).get("/missing").expect(404);
  });
});
