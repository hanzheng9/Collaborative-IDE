import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileDialog } from "./FileDialog";
import type { WorkspaceFile } from "../types";

const files: WorkspaceFile[] = [
  {
    fileId: "main.ts",
    fileName: "main.ts",
    language: "typescript",
    content: ""
  }
];

describe("FileDialog", () => {
  it("submits a trimmed valid filename with Enter", async () => {
    const onSubmit = vi.fn();

    render(
      <FileDialog
        files={files}
        mode="create"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    const input = screen.getByLabelText(/filename/i);
    await userEvent.type(input, "  utils.ts  {Enter}");

    expect(onSubmit).toHaveBeenCalledWith("utils.ts");
  });

  it("shows validation for empty and duplicate filenames", async () => {
    const onSubmit = vi.fn();

    render(
      <FileDialog
        files={files}
        mode="create"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /create/i }));
    expect(screen.getByText(/filename is required/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/filename/i), "MAIN.TS");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));
    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("cancels with Escape", async () => {
    const onCancel = vi.fn();

    render(
      <FileDialog
        files={files}
        mode="rename"
        initialValue="main.ts"
        onCancel={onCancel}
        onSubmit={vi.fn()}
      />
    );

    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
  });

  it("allows rename to keep the same filename", async () => {
    const onSubmit = vi.fn();

    render(
      <FileDialog
        files={files}
        mode="rename"
        initialValue="main.ts"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /rename/i }));
    expect(onSubmit).toHaveBeenCalledWith("main.ts");
  });
});
