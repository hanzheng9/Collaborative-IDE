import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CollaboratorList } from "./CollaboratorList";
import type { Collaborator, WorkspaceFile } from "../types";

const files: WorkspaceFile[] = [
  {
    fileId: "main.ts",
    fileName: "main.ts",
    language: "typescript",
    content: ""
  },
  {
    fileId: "utils.ts",
    fileName: "utils.ts",
    language: "typescript",
    content: ""
  }
];

const collaborators: Collaborator[] = [
  {
    userId: "local",
    displayName: "User 1",
    color: "red",
    currentFileId: "main.ts",
    cursorPosition: { lineNumber: 1, column: 1 }
  },
  {
    userId: "remote",
    displayName: "User 2",
    color: "blue",
    currentFileId: "utils.ts",
    cursorPosition: null
  }
];

describe("CollaboratorList", () => {
  it("renders collaborators, current file names, and local user marker", () => {
    render(
      <CollaboratorList
        collaborators={collaborators}
        files={files}
        localUserId="local"
        onJumpToCollaborator={vi.fn()}
      />
    );

    expect(screen.getByText(/user 1 \(you\)/i)).toBeInTheDocument();
    expect(screen.getByText("main.ts")).toBeInTheDocument();
    expect(screen.getByText("utils.ts")).toBeInTheDocument();
  });

  it("calls jump handler when a collaborator is clicked", async () => {
    const onJumpToCollaborator = vi.fn();

    render(
      <CollaboratorList
        collaborators={collaborators}
        files={files}
        localUserId="local"
        onJumpToCollaborator={onJumpToCollaborator}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /user 2/i }));
    expect(onJumpToCollaborator).toHaveBeenCalledWith(collaborators[1]);
  });

  it("shows empty collaborator states", () => {
    render(
      <CollaboratorList
        collaborators={[]}
        files={files}
        localUserId={null}
        onJumpToCollaborator={vi.fn()}
      />
    );

    expect(screen.getByText(/waiting for collaborators/i)).toBeInTheDocument();
  });
});
