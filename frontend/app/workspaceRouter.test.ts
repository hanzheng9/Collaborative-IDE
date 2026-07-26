import { describe, expect, it } from "vitest";
import {
  getWorkspacePath,
  isValidWorkspaceId,
  parseWorkspaceInput
} from "./workspaceRouter";

describe("workspace routing helpers", () => {
  it("validates shareable workspace IDs", () => {
    expect(isValidWorkspaceId("abc123")).toBe(true);
    expect(isValidWorkspaceId("my-project")).toBe(true);
    expect(isValidWorkspaceId("my_project")).toBe(true);
    expect(isValidWorkspaceId("ab")).toBe(false);
    expect(isValidWorkspaceId("bad workspace")).toBe(false);
    expect(isValidWorkspaceId("/workspace/demo")).toBe(false);
  });

  it("builds workspace URLs", () => {
    expect(getWorkspacePath("my-project")).toBe("/workspace/my-project");
  });

  it("parses workspace IDs from links and plain input", () => {
    expect(parseWorkspaceInput("my-project")).toBe("my-project");
    expect(parseWorkspaceInput("/workspace/my-project")).toBe("my-project");
    expect(parseWorkspaceInput("http://localhost:3000/workspace/my-project")).toBe(
      "my-project"
    );
  });
});
