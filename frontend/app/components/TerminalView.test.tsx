import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TerminalView } from "./TerminalView";

describe("TerminalView", () => {
  it("displays supported commands for help", async () => {
    render(
      <TerminalView files={[{ fileName: "main.py" }]} onRunCommand={vi.fn()} />
    );

    await userEvent.type(screen.getByLabelText(/terminal command/i), "help{Enter}");

    expect(screen.getByText(/supported commands/i)).toBeInTheDocument();
    expect(screen.getByText(/python3/i)).toBeInTheDocument();
    expect(screen.getByText(/npx tsx/i)).toBeInTheDocument();
  });

  it("shows friendly guidance for unsupported commands", async () => {
    render(
      <TerminalView files={[{ fileName: "main.py" }]} onRunCommand={vi.fn()} />
    );

    await userEvent.type(
      screen.getByLabelText(/terminal command/i),
      "docker ps{Enter}"
    );

    expect(screen.getByText(/command not supported/i)).toBeInTheDocument();
    expect(screen.getByText(/type "help"/i)).toBeInTheDocument();
  });

  it("explains intentionally unsupported command categories", async () => {
    render(
      <TerminalView files={[{ fileName: "main.py" }]} onRunCommand={vi.fn()} />
    );

    await userEvent.type(screen.getByLabelText(/terminal command/i), "cd src{Enter}");
    expect(
      screen.getByText(/persistent working directories are not currently supported/i)
    ).toBeInTheDocument();

    await userEvent.type(
      screen.getByLabelText(/terminal command/i),
      "npm install react{Enter}"
    );
    expect(
      screen.getByText(/package installation is not currently supported/i)
    ).toBeInTheDocument();
  });

  it("runs supported commands and preserves command history", async () => {
    const onRunCommand = vi.fn().mockResolvedValue("Completed successfully");

    render(
      <TerminalView
        files={[{ fileName: "main.py" }]}
        onRunCommand={onRunCommand}
      />
    );
    const input = screen.getByLabelText(/terminal command/i);

    await userEvent.type(input, "python main.py{Enter}");
    expect(onRunCommand).toHaveBeenCalledWith("python main.py");
    expect(await screen.findByText(/completed successfully/i)).toBeInTheDocument();

    await userEvent.type(input, "{ArrowUp}");
    expect(input).toHaveValue("python main.py");
  });
});
