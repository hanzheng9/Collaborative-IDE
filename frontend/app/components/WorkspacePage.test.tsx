import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCode } from "../codeExecution";
import { useCollaborativeWorkspace } from "../hooks/useCollaborativeWorkspace";
import { WorkspacePage } from "./WorkspacePage";

vi.mock("../codeExecution", async () => {
  const actual = await vi.importActual<typeof import("../codeExecution")>(
    "../codeExecution"
  );

  return {
    ...actual,
    runCode: vi.fn()
  };
});

vi.mock("../hooks/useCollaborativeWorkspace", () => ({
  useCollaborativeWorkspace: vi.fn()
}));

vi.mock("./CodeEditor", () => ({
  CodeEditor: () => <div>Editor</div>
}));

const file = {
  content: "console.log('hello');",
  fileId: "main.js",
  fileName: "main.js",
  language: "javascript"
};

function mockWorkspace(selectedFile: typeof file | null = file) {
  vi.mocked(useCollaborativeWorkspace).mockReturnValue({
    collaborators: [],
    connectionStatus: "connected",
    createFile: vi.fn(),
    deleteFile: vi.fn(),
    feedbackMessage: "",
    files: selectedFile ? [selectedFile] : [],
    getAiSelection: vi.fn(),
    handleEditorChange: vi.fn(),
    handleEditorMount: vi.fn(),
    isMonacoReady: true,
    isWorkspaceLoaded: true,
    jumpToCollaborator: vi.fn(),
    localUserId: "local",
    renameFile: vi.fn(),
    replaceAiSelection: vi.fn(),
    selectedFile,
    selectedFileId: selectedFile?.fileId ?? null,
    selectFile: vi.fn(),
    showFeedback: vi.fn(),
    syncStatus: "synced"
  });
}

describe("WorkspacePage execution", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("runs the active file from the Run Code button", async () => {
    mockWorkspace();
    vi.mocked(runCode).mockResolvedValue({
      status: "success",
      stderr: "",
      stdout: "hello\n"
    });

    render(<WorkspacePage workspaceId="workspace-1" />);
    await userEvent.click(screen.getByRole("button", { name: /^run code$/i }));

    await waitFor(() => {
      expect(runCode).toHaveBeenCalledWith(
        "workspace-1",
        file,
        [file],
        "",
        expect.any(AbortSignal)
      );
    });
    expect(await screen.findByText(/hello/i)).toBeInTheDocument();
  });

  it("starts execution with Ctrl+Enter", async () => {
    mockWorkspace();
    vi.mocked(runCode).mockResolvedValue({
      status: "success",
      stderr: "",
      stdout: ""
    });

    render(<WorkspacePage workspaceId="workspace-1" />);
    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => {
      expect(runCode).toHaveBeenCalled();
    });
  });

  it("shows an error when no file is active", async () => {
    mockWorkspace(null);

    render(<WorkspacePage workspaceId="workspace-1" />);
    await userEvent.click(screen.getByRole("button", { name: /^run code$/i }));

    expect(screen.getByText(/select a file before running code/i)).toBeInTheDocument();
    expect(runCode).not.toHaveBeenCalled();
  });
});
