import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("Express app", () => {
  it("responds to GET /health", async () => {
    await request(createApp())
      .get("/health")
      .expect(200)
      .expect("Content-Type", /json/)
      .expect({ status: "ok" });
  });

  it("returns 404 for unknown endpoints", async () => {
    await request(createApp()).get("/missing").expect(404);
  });
});
