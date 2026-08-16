import { describe, expect, it } from "vitest";
import { getBackendUrl } from "./backendUrl";

describe("backend URL helper", () => {
  it("builds API URLs from the shared backend origin", () => {
    expect(getBackendUrl("/health")).toBe("http://localhost:4000/health");
  });
});
