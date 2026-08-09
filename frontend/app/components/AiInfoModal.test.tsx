import { Theme } from "@carbon/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AiInfoModal } from "./AiInfoModal";

describe("AiInfoModal", () => {
  it.each(["white", "g100"] as const)("renders in %s theme", (theme) => {
    render(
      <Theme theme={theme}>
        <AiInfoModal onClose={vi.fn()} />
      </Theme>
    );

    expect(
      screen.getByRole("heading", { name: /ai assistant limits/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/current limits/i)).toBeInTheDocument();
    expect(screen.getByText(/5 per 10 minutes/i)).toBeInTheDocument();
  });

  it("closes with Escape", async () => {
    const onClose = vi.fn();
    render(<AiInfoModal onClose={onClose} />);

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
  });
});
