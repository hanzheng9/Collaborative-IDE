import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeleteFileDialog } from "./DeleteFileDialog";
import type { WorkspaceFile } from "../types";

const file: WorkspaceFile = {
  fileId: "main.ts",
  fileName: "main.ts",
  language: "typescript",
  content: ""
};

describe("DeleteFileDialog", () => {
  it("shows the filename and confirms deletion", async () => {
    const onConfirm = vi.fn();

    render(
      <DeleteFileDialog
        file={file}
        isPending={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText("main.ts")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("cancels with Escape and disables repeated submissions while pending", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <DeleteFileDialog
        file={file}
        isPending
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByRole("button", { name: /deleting/i })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
