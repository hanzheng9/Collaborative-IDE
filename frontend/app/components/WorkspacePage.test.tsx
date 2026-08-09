import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCode } from "../codeExecution";
import { useCollaborativeWorkspace } from "../hooks/useCollaborativeWorkspace";
import { WorkspacePage } from "./WorkspacePage";

const pushMock = vi.fn();

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

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock
  })
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

function mockWorkspace(
  selectedFile: typeof file | null = file,
  options: { syncStatus?: "synced" | "syncing" | "unsaved" | "connection-lost" } = {}
) {
  const leaveWorkspace = vi.fn();
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
    leaveWorkspace,
    localUserId: "local",
    relayoutEditor: vi.fn(),
    renameFile: vi.fn(),
    replaceAiSelection: vi.fn(),
    selectedFile,
    selectedFileId: selectedFile?.fileId ?? null,
    selectFile: vi.fn(),
    showFeedback: vi.fn(),
    syncStatus: options.syncStatus ?? "synced",
    workspaceError: null
  });

  return { leaveWorkspace };
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

  it("opens and closes terminal capabilities", async () => {
    mockWorkspace();

    render(<WorkspacePage workspaceId="workspace-1" />);
    await userEvent.click(
      screen.getByRole("button", { name: /terminal capabilities/i })
    );

    expect(
      screen.getByRole("heading", { name: /terminal capabilities/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/supported features/i)).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: /terminal capabilities/i })
      ).not.toBeInTheDocument();
    });
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

  it("opens a confirmation before leaving the workspace", async () => {
    const { leaveWorkspace } = mockWorkspace();

    render(<WorkspacePage workspaceId="workspace-1" />);
    await userEvent.click(
      screen.getByRole("button", { name: /leave workspace/i })
    );

    expect(screen.getByText(/you will disconnect from this workspace/i)).toBeInTheDocument();
    expect(leaveWorkspace).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("cancels leaving the workspace", async () => {
    const { leaveWorkspace } = mockWorkspace();

    render(<WorkspacePage workspaceId="workspace-1" />);
    await userEvent.click(
      screen.getByRole("button", { name: /leave workspace/i })
    );
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByText(/you will disconnect from this workspace/i)).not.toBeInTheDocument();
    expect(leaveWorkspace).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("cancels leaving with Escape", async () => {
    const { leaveWorkspace } = mockWorkspace();

    render(<WorkspacePage workspaceId="workspace-1" />);
    await userEvent.click(
      screen.getByRole("button", { name: /leave workspace/i })
    );
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByText(/you will disconnect from this workspace/i)).not.toBeInTheDocument();
    expect(leaveWorkspace).not.toHaveBeenCalled();
  });

  it("confirms leaving the workspace and navigates home", async () => {
    const { leaveWorkspace } = mockWorkspace();

    render(<WorkspacePage workspaceId="workspace-1" />);
    await userEvent.click(
      screen.getByRole("button", { name: /leave workspace/i })
    );
    await userEvent.click(
      screen.getAllByRole("button", { name: /leave workspace/i }).at(-1)!
    );

    expect(leaveWorkspace).toHaveBeenCalledOnce();
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("shows a stronger warning when leaving with unsynced changes", async () => {
    mockWorkspace(file, { syncStatus: "unsaved" });

    render(<WorkspacePage workspaceId="workspace-1" />);
    await userEvent.click(
      screen.getByRole("button", { name: /leave workspace/i })
    );

    expect(
      screen.getByText(/some changes may not be synchronized yet/i)
    ).toBeInTheDocument();
  });

  it("shows an expired workspace state", async () => {
    vi.mocked(useCollaborativeWorkspace).mockReturnValue({
      collaborators: [],
      connectionStatus: "connected",
      createFile: vi.fn(),
      cursorPosition: null,
      deleteFile: vi.fn(),
      feedbackMessage: "",
      files: [],
      getAiSelection: vi.fn(),
      handleEditorChange: vi.fn(),
      handleEditorMount: vi.fn(),
      isMonacoReady: true,
      isWorkspaceLoaded: false,
      jumpToCollaborator: vi.fn(),
      leaveWorkspace: vi.fn(),
      localUserId: null,
      relayoutEditor: vi.fn(),
      renameFile: vi.fn(),
      replaceAiSelection: vi.fn(),
      selectedFile: null,
      selectedFileId: null,
      selectFile: vi.fn(),
      showFeedback: vi.fn(),
      syncStatus: "synced",
      workspaceError: {
        code: "WORKSPACE_NOT_FOUND",
        message: "Workspace not found or expired."
      }
    });

    render(<WorkspacePage workspaceId="workspace-1" />);

    expect(
      screen.getByText(/this workspace no longer exists or has expired/i)
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /back home/i })
    );
    expect(pushMock).toHaveBeenCalledWith("/");
  });
});
