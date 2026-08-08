import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExecutionPanel } from "./ExecutionPanel";

describe("ExecutionPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const baseProps = {
    files: [{ fileName: "main.js" }],
    onOpenTerminalInfo: vi.fn(),
    onRunTerminalCommand: vi.fn().mockResolvedValue("Completed successfully"),
    onToggleCollapsed: vi.fn()
  };

  it("shows loading state", () => {
    render(
      <ExecutionPanel
        activeTab="output"
        error=""
        files={baseProps.files}
        isCollapsed={false}
        isRunning
        result={null}
        stdin=""
        setStdin={vi.fn()}
        onClear={vi.fn()}
        onOpenTerminalInfo={baseProps.onOpenTerminalInfo}
        onTabChange={vi.fn()}
        onToggleCollapsed={baseProps.onToggleCollapsed}
        onRun={vi.fn()}
        onRunTerminalCommand={baseProps.onRunTerminalCommand}
        onStop={vi.fn()}
      />
    );

    expect(screen.getByText(/running/i)).toBeInTheDocument();
  });

  it("renders stdout and stderr as plain text", () => {
    render(
      <ExecutionPanel
        activeTab="output"
        error=""
        files={baseProps.files}
        isCollapsed={false}
        isRunning={false}
        result={{
          durationMs: 12,
          exitCode: 1,
          status: "runtime_error",
          stderr: "<b>boom</b>",
          stdout: "hello"
        }}
        stdin=""
        setStdin={vi.fn()}
        onClear={vi.fn()}
        onOpenTerminalInfo={baseProps.onOpenTerminalInfo}
        onTabChange={vi.fn()}
        onToggleCollapsed={baseProps.onToggleCollapsed}
        onRun={vi.fn()}
        onRunTerminalCommand={baseProps.onRunTerminalCommand}
        onStop={vi.fn()}
      />
    );

    expect(screen.getByText(/runtime error/i)).toBeInTheDocument();
    expect(screen.getByText(/<b>boom<\/b>/i)).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
  });

  it("supports standard input, clear, copy, and stop", async () => {
    const setStdin = vi.fn();
    const onClear = vi.fn();
    const onStop = vi.fn();
    const onTabChange = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText }
    });

    render(
      <ExecutionPanel
        activeTab="input"
        error=""
        files={baseProps.files}
        isCollapsed={false}
        isRunning
        result={{
          status: "success",
          stderr: "",
          stdout: "copy me"
        }}
        stdin=""
        setStdin={setStdin}
        onClear={onClear}
        onOpenTerminalInfo={baseProps.onOpenTerminalInfo}
        onTabChange={onTabChange}
        onToggleCollapsed={baseProps.onToggleCollapsed}
        onRun={vi.fn()}
        onRunTerminalCommand={baseProps.onRunTerminalCommand}
        onStop={onStop}
      />
    );

    await userEvent.click(screen.getByRole("tab", { name: /input/i }));
    await userEvent.type(screen.getByLabelText(/standard input/i), "abc");
    expect(setStdin).toHaveBeenCalled();

    await userEvent.click(screen.getByRole("tab", { name: /output/i }));
    await userEvent.click(screen.getByRole("button", { name: /copy/i }));
    await userEvent.click(screen.getByRole("button", { name: /clear/i }));
    await userEvent.click(screen.getByRole("button", { name: /stop/i }));

    expect(writeText).toHaveBeenCalledWith("copy me");
    expect(onClear).toHaveBeenCalled();
    expect(onStop).toHaveBeenCalled();
    expect(onTabChange).toHaveBeenCalledWith("output");
  });

  it("shows terminal information button", async () => {
    const onOpenTerminalInfo = vi.fn();

    render(
      <ExecutionPanel
        activeTab="terminal"
        error=""
        files={baseProps.files}
        isCollapsed={false}
        isRunning={false}
        result={null}
        stdin=""
        setStdin={vi.fn()}
        onClear={vi.fn()}
        onOpenTerminalInfo={onOpenTerminalInfo}
        onRun={vi.fn()}
        onRunTerminalCommand={baseProps.onRunTerminalCommand}
        onStop={vi.fn()}
        onTabChange={vi.fn()}
        onToggleCollapsed={baseProps.onToggleCollapsed}
      />
    );

    const infoButton = screen.getByRole("button", {
      name: /terminal capabilities/i
    });
    expect(infoButton).toBeInTheDocument();
    await userEvent.click(infoButton);
    expect(onOpenTerminalInfo).toHaveBeenCalledOnce();
  });
});
