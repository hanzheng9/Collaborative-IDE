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
  CodeEditor: ({ monacoTheme }: { monacoTheme: string }) => (
    <div data-testid="code-editor" data-monaco-theme={monacoTheme}>
      Editor
    </div>
  )
}));

const file = {
  content: "console.log('hello');",
  fileId: "main.js",
  fileName: "main.js",
  language: "javascript"
};

const defaultMatchMedia = window.matchMedia;

function mockWorkspace(selectedFile: typeof file | null = file) {
  vi.mocked(useCollaborativeWorkspace).mockReturnValue({
    collaborators: [],
    connectionStatus: "connected",
    createFile: vi.fn(),
    cursorPosition: null,
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
    relayoutEditor: vi.fn(),
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
    if (typeof window.localStorage?.clear === "function") {
      window.localStorage.clear();
    }
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
    window.matchMedia = defaultMatchMedia;
  });

  it("runs the active file from the Run Code button", async () => {
    mockWorkspace();
    vi.mocked(runCode).mockResolvedValue({
      status: "success",
      stderr: "",
      stdout: "hello\n"
    });

    render(<WorkspacePage workspaceId="workspace-1" />);
    await userEvent.click(
      screen.getByRole("button", { name: /^run code$/i })
    );

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

  it("shows the lower panel expanded by default", () => {
    mockWorkspace();

    render(<WorkspacePage workspaceId="workspace-1" />);

    expect(screen.getByRole("region", { name: /lower panel/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /input/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /output/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: /terminal/i })).toBeInTheDocument();
    expect(screen.getByText(/run code to see output/i)).toBeInTheDocument();
    expect(
      screen.getByRole("separator", { name: /resize lower panel/i })
    ).toBeInTheDocument();
  });

  it("keeps the lower panel tab bar visible while collapsed", async () => {
    mockWorkspace();

    render(<WorkspacePage workspaceId="workspace-1" />);
    await userEvent.click(
      screen.getByRole("button", { name: /collapse lower panel/i })
    );

    expect(screen.getByRole("tab", { name: /input/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /output/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /terminal/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /expand lower panel/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/run code to see output/i)).not.toBeInTheDocument();
  });

  it("shrinks the lower panel with keyboard arrows", async () => {
    mockWorkspace();

    render(<WorkspacePage workspaceId="workspace-1" />);
    const separator = screen.getByRole("separator", {
      name: /resize lower panel/i
    });

    separator.focus();
    await userEvent.keyboard("{ArrowDown}");

    expect(separator).toHaveAttribute("aria-valuenow", "120");
  });

  it("updates and persists the workspace theme without reloading", async () => {
    mockWorkspace();

    render(<WorkspacePage workspaceId="workspace-1" />);

    expect(screen.getByTestId("code-editor")).toHaveAttribute(
      "data-monaco-theme",
      "vs"
    );

    await userEvent.click(screen.getByRole("button", { name: /theme: light/i }));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("collaborativeIde.theme")).toBe("dark");
    expect(screen.getByTestId("code-editor")).toHaveAttribute(
      "data-monaco-theme",
      "vs-dark"
    );
  });

  it("restores a saved dark theme preference", () => {
    window.localStorage.setItem("collaborativeIde.theme", "dark");
    mockWorkspace();

    render(<WorkspacePage workspaceId="workspace-1" />);

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(screen.getByTestId("code-editor")).toHaveAttribute(
      "data-monaco-theme",
      "vs-dark"
    );
  });

  it("uses the operating system preference on first launch", () => {
    window.matchMedia = vi.fn().mockReturnValue({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: true,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn()
    });
    mockWorkspace();

    render(<WorkspacePage workspaceId="workspace-1" />);

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(screen.getByTestId("code-editor")).toHaveAttribute(
      "data-monaco-theme",
      "vs-dark"
    );
  });

  it("toggles from dark to light in one click", async () => {
    window.localStorage.setItem("collaborativeIde.theme", "dark");
    mockWorkspace();

    render(<WorkspacePage workspaceId="workspace-1" />);
    await userEvent.click(screen.getByRole("button", { name: /theme: dark/i }));

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem("collaborativeIde.theme")).toBe("light");
    expect(screen.getByTestId("code-editor")).toHaveAttribute(
      "data-monaco-theme",
      "vs"
    );
  });
});
