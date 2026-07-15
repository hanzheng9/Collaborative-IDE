import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileSidebar } from "./FileSidebar";
import type { WorkspaceFile } from "../types";

const files: WorkspaceFile[] = [
  {
    fileId: "main.ts",
    fileName: "main.ts",
    language: "typescript",
    content: ""
  },
  {
    fileId: "long-file",
    fileName: "very.long.filename.with.many.parts.ts",
    language: "typescript",
    content: ""
  }
];

describe("FileSidebar", () => {
  it("renders files, highlights selected file, and selects by stable fileId", async () => {
    const onSelectFile = vi.fn();

    render(
      <FileSidebar
        files={files}
        selectedFileId="main.ts"
        onDeleteFile={vi.fn()}
        onCreateFile={vi.fn()}
        onRenameFile={vi.fn()}
        onSelectFile={onSelectFile}
      />
    );

    expect(
      screen.getByTitle("main.ts").closest(".fileRow")
    ).toHaveClass("active");
    expect(
      screen.getByTitle("very.long.filename.with.many.parts.ts")
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByTitle("very.long.filename.with.many.parts.ts")
    );
    expect(onSelectFile).toHaveBeenCalledWith("long-file");
  });

  it("opens create and rename actions", async () => {
    const onCreateFile = vi.fn();
    const onRenameFile = vi.fn();

    render(
      <FileSidebar
        files={files}
        selectedFileId="main.ts"
        onDeleteFile={vi.fn()}
        onCreateFile={onCreateFile}
        onRenameFile={onRenameFile}
        onSelectFile={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /new/i }));
    await userEvent.click(
      screen.getByRole("button", { name: /rename selected/i })
    );

    expect(onCreateFile).toHaveBeenCalled();
    expect(onRenameFile).toHaveBeenCalled();
  });

  it("calls delete action with the target file", async () => {
    const onDeleteFile = vi.fn();

    render(
      <FileSidebar
        files={files}
        selectedFileId="main.ts"
        onDeleteFile={onDeleteFile}
        onCreateFile={vi.fn()}
        onRenameFile={vi.fn()}
        onSelectFile={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /delete main\.ts/i }));
    expect(onDeleteFile).toHaveBeenCalledWith(files[0]);
  });

  it("shows an empty state and disables rename when no file is selected", () => {
    render(
      <FileSidebar
        files={[]}
        selectedFileId={null}
        onDeleteFile={vi.fn()}
        onCreateFile={vi.fn()}
        onRenameFile={vi.fn()}
        onSelectFile={vi.fn()}
      />
    );

    expect(screen.getByText(/no files yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rename selected/i })).toBeDisabled();
  });
});
