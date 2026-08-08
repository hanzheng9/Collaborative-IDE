import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addRecentWorkspace } from "../utils/recentWorkspaces";
import { WorkspaceLanding } from "./WorkspaceLanding";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock
  })
}));

describe("WorkspaceLanding", () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("renders recent workspaces", () => {
    addRecentWorkspace({
      workspaceId: "interview-prep",
      name: "Interview Prep",
      lastFileName: "main.ts"
    });

    render(<WorkspaceLanding />);

    expect(
      screen.getByRole("heading", { name: /recent workspaces/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Interview Prep")).toBeInTheDocument();
    expect(screen.getByText(/interview-prep \/ main.ts/i)).toBeInTheDocument();
  });

  it("opens a recent workspace without marking it as newly created", async () => {
    addRecentWorkspace({
      workspaceId: "backend-project",
      name: "Backend Project"
    });

    render(<WorkspaceLanding />);
    await userEvent.click(
      screen.getByRole("button", { name: /open workspace backend project/i })
    );

    expect(pushMock).toHaveBeenCalledWith("/workspace/backend-project");
    expect(
      window.sessionStorage.getItem(
        "collaborativeIde.createWorkspace.backend-project"
      )
    ).toBeNull();
  });

  it("removes a recent workspace without deleting or opening it", async () => {
    addRecentWorkspace({
      workspaceId: "local-only",
      name: "Local Only"
    });

    render(<WorkspaceLanding />);
    await userEvent.click(
      screen.getByRole("button", {
        name: /remove local only from recent workspaces/i
      })
    );

    expect(screen.queryByText("Local Only")).not.toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("clears recent workspaces after confirmation", async () => {
    addRecentWorkspace({ workspaceId: "alpha", name: "Alpha" });
    addRecentWorkspace({ workspaceId: "beta", name: "Beta" });

    render(<WorkspaceLanding />);
    await userEvent.click(
      screen.getByRole("button", { name: /clear recent workspaces/i })
    );
    await userEvent.click(screen.getByRole("button", { name: /clear history/i }));

    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });

  it("creates a workspace and stores the creation marker", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "abc12345-0000-4000-8000-000000000000"
    );

    render(<WorkspaceLanding />);
    await userEvent.click(
      screen.getByRole("button", { name: /create workspace/i })
    );

    expect(pushMock).toHaveBeenCalledWith("/workspace/abc12345");
    expect(
      window.sessionStorage.getItem(
        "collaborativeIde.createWorkspace.abc12345"
      )
    ).toBe("true");
  });
});
