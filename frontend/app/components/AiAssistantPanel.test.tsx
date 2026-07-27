import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiAssistantPanel } from "./AiAssistantPanel";
import type { AiCodeSelection } from "../hooks/useCollaborativeWorkspace";

const selection: AiCodeSelection = {
  code: "const value = 1;",
  fileId: "main.ts",
  fileName: "main.ts",
  language: "typescript",
  range: {
    endColumn: 17,
    endLineNumber: 1,
    startColumn: 1,
    startLineNumber: 1
  },
  surroundingCode: "const value = 1;"
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    json: () => Promise.resolve(body),
    ok,
    status
  } as Response);
}

describe("AiAssistantPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a warning when no code is selected", async () => {
    render(
      <AiAssistantPanel
        getSelection={() => null}
        onClose={vi.fn()}
        onReplaceSelection={vi.fn()}
      />
    );

    expect(
      screen.getByText(/select some code in the editor/i)
    ).toBeInTheDocument();
  });

  it("sends selected code and metadata", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(await jsonResponse({ action: "explain", result: "Explained" }));

    render(
      <AiAssistantPanel
        getSelection={() => selection}
        onClose={vi.fn()}
        onReplaceSelection={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /explain/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      action: "explain",
      code: selection.code,
      fileName: selection.fileName,
      language: selection.language,
      surroundingCode: selection.surroundingCode
    });
  });

  it("uses the captured selection when Monaco focus changes before action click", async () => {
    let resolveFirst: (value: Response) => void = () => undefined;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValueOnce(firstResponse);
    const getSelection = vi.fn().mockReturnValueOnce(selection).mockReturnValue(null);

    render(
      <AiAssistantPanel
        getSelection={getSelection}
        onClose={vi.fn()}
        onReplaceSelection={vi.fn()}
      />
    );

    const fixButton = screen.getByRole("button", { name: /fix bug/i });
    fireEvent.pointerDown(fixButton);
    expect(screen.getByRole("status")).toHaveTextContent(/starting fix bug/i);
    await userEvent.click(fixButton);

    expect(screen.getByRole("status")).toHaveTextContent(/asking ai to fix bug/i);
    expect(fetchMock).toHaveBeenCalled();
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      action: "fix",
      code: selection.code
    });

    resolveFirst(
      (await jsonResponse({ action: "fix", result: "Fixed" })) as Response
    );
    expect(await screen.findByText(/fixed/i)).toBeInTheDocument();
  });

  it("shows loading, error, and retry states", async () => {
    let resolveFirst: (value: Response) => void = () => undefined;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    vi.spyOn(globalThis, "fetch")
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce(await jsonResponse({ action: "explain", result: "Retry ok" }));

    render(
      <AiAssistantPanel
        getSelection={() => selection}
        onClose={vi.fn()}
        onReplaceSelection={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /explain/i }));
    expect(screen.getByRole("status")).toHaveTextContent(/asking ai to explain/i);
    resolveFirst(
      (await jsonResponse({ error: "Friendly error" }, false, 503)) as Response
    );
    expect(await screen.findByText(/friendly error/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText(/retry ok/i)).toBeInTheDocument();
  });

  it("copies the response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      await jsonResponse({ action: "explain", result: "Copy this" })
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText }
    });

    render(
      <AiAssistantPanel
        getSelection={() => selection}
        onClose={vi.fn()}
        onReplaceSelection={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /explain/i }));
    expect(await screen.findByText(/copy this/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /copy/i }));

    expect(writeText).toHaveBeenCalledWith("Copy this");
  });

  it("does not replace code automatically and replaces only after explicit action", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      await jsonResponse({
        action: "refactor",
        result: "Use this:\n```ts\nconst value = 2;\n```"
      })
    );
    const onReplaceSelection = vi.fn().mockReturnValue({ ok: true });

    render(
      <AiAssistantPanel
        getSelection={() => selection}
        onClose={vi.fn()}
        onReplaceSelection={onReplaceSelection}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /refactor/i }));
    expect(await screen.findByText(/use this/i)).toBeInTheDocument();
    expect(onReplaceSelection).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: /replace selection/i })
    );
    expect(onReplaceSelection).toHaveBeenCalledWith(selection, "const value = 2;");
  });

  it("disables actions while a request is active", async () => {
    let resolveFirst: (value: Response) => void = () => undefined;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockReturnValueOnce(firstResponse);

    render(
      <AiAssistantPanel
        getSelection={() => selection}
        onClose={vi.fn()}
        onReplaceSelection={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /explain/i }));
    expect(screen.getByRole("button", { name: /fix bug/i })).toBeDisabled();

    resolveFirst(
      (await jsonResponse({ action: "explain", result: "Done" })) as Response
    );
    expect(await screen.findByText(/done/i)).toBeInTheDocument();
  });

  it("keeps showing loading after a request captures a fresh editor selection", async () => {
    const freshSelection = { ...selection, code: "const fresh = true;" };
    const pendingResponse = new Promise<Response>(() => undefined);
    vi.spyOn(globalThis, "fetch").mockReturnValueOnce(pendingResponse);
    const getSelection = vi
      .fn()
      .mockReturnValueOnce(selection)
      .mockReturnValueOnce(freshSelection);

    render(
      <AiAssistantPanel
        getSelection={getSelection}
        onClose={vi.fn()}
        onReplaceSelection={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /fix bug/i }));

    expect(screen.getByRole("status")).toHaveTextContent(/asking ai to fix bug/i);
    expect(
      screen.queryByText(/choose an action for the selected code/i)
    ).not.toBeInTheDocument();
  });
});
