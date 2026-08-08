import { Theme } from "@carbon/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TerminalInfoModal } from "./TerminalInfoModal";

describe("TerminalInfoModal", () => {
  it.each(["white", "g100"] as const)("renders in %s theme", (theme) => {
    render(
      <Theme theme={theme}>
        <TerminalInfoModal onClose={vi.fn()} />
      </Theme>
    );

    expect(
      screen.getByRole("heading", { name: /terminal capabilities/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/current limitations/i)).toBeInTheDocument();
    expect(screen.getByText(/planned improvements/i)).toBeInTheDocument();
  });

  it("closes with Escape", async () => {
    const onClose = vi.fn();
    render(<TerminalInfoModal onClose={onClose} />);

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
  });
});
