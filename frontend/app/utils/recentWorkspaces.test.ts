import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addRecentWorkspace,
  clearRecentWorkspaces,
  formatRecentWorkspaceTime,
  getRecentWorkspaces,
  removeRecentWorkspace
} from "./recentWorkspaces";

describe("recent workspace history", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00.000Z"));
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("adds a workspace", () => {
    addRecentWorkspace({
      workspaceId: "demo",
      name: "Interview Prep",
      lastFileName: "main.ts"
    });

    expect(getRecentWorkspaces()).toEqual([
      {
        workspaceId: "demo",
        name: "Interview Prep",
        lastFileName: "main.ts",
        lastVisitedAt: "2026-08-07T12:00:00.000Z"
      }
    ]);
  });

  it("updates revisited workspaces without duplicates", () => {
    addRecentWorkspace({ workspaceId: "demo", name: "Old Name" });
    vi.setSystemTime(new Date("2026-08-07T13:00:00.000Z"));
    addRecentWorkspace({ workspaceId: "demo", name: "New Name" });

    expect(getRecentWorkspaces()).toHaveLength(1);
    expect(getRecentWorkspaces()[0]).toMatchObject({
      workspaceId: "demo",
      name: "New Name",
      lastVisitedAt: "2026-08-07T13:00:00.000Z"
    });
  });

  it("sorts by last visit and limits history to 10 entries", () => {
    for (let index = 0; index < 11; index += 1) {
      vi.setSystemTime(new Date(Date.UTC(2026, 7, 7, 12, index)));
      addRecentWorkspace({
        workspaceId: `workspace-${index}`,
        name: `Workspace ${index}`
      });
    }

    const recentWorkspaces = getRecentWorkspaces();

    expect(recentWorkspaces).toHaveLength(10);
    expect(recentWorkspaces[0]?.workspaceId).toBe("workspace-10");
    expect(
      recentWorkspaces.some((workspace) => workspace.workspaceId === "workspace-0")
    ).toBe(false);
  });

  it("removes and clears entries", () => {
    addRecentWorkspace({ workspaceId: "alpha", name: "Alpha" });
    addRecentWorkspace({ workspaceId: "beta", name: "Beta" });

    removeRecentWorkspace("alpha");
    expect(getRecentWorkspaces()).toEqual([
      expect.objectContaining({ workspaceId: "beta" })
    ]);

    clearRecentWorkspaces();
    expect(getRecentWorkspaces()).toEqual([]);
  });

  it("fails safely for malformed localStorage data", () => {
    window.localStorage.setItem("collaborativeIde.recentWorkspaces", "{nope");

    expect(getRecentWorkspaces()).toEqual([]);
  });

  it("formats relative visit times", () => {
    expect(formatRecentWorkspaceTime("2026-08-07T12:00:00.000Z")).toBe(
      "Visited just now"
    );
    expect(formatRecentWorkspaceTime("2026-08-07T10:00:00.000Z")).toBe(
      "Visited 2 hours ago"
    );
    expect(formatRecentWorkspaceTime("2026-08-06T12:00:00.000Z")).toBe(
      "Visited yesterday"
    );
  });
});
