import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileVersionHistoryPanel } from "./FileVersionHistoryPanel";

vi.mock("@monaco-editor/react", () => ({
  default: ({ value }: { value: string }) => (
    <pre data-testid="version-preview">{value}</pre>
  )
}));

const file = {
  content: "const current = true;",
  fileId: "main.ts",
  fileName: "main.ts",
  language: "typescript"
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    json: () => Promise.resolve(body),
    ok,
    status
  } as Response);
}

describe("FileVersionHistoryPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows an empty state when no saved versions exist", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      await jsonResponse({ versions: [] })
    );

    render(
      <FileVersionHistoryPanel
        isMonacoReady
        monacoTheme="vs"
        selectedFile={file}
        workspaceId="demo"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent(/loading version/i);
    expect(
      await screen.findByText(/no saved versions yet/i)
    ).toBeInTheDocument();
  });

  it("opens version history information", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      await jsonResponse({ versions: [] })
    );

    render(
      <FileVersionHistoryPanel
        isMonacoReady
        monacoTheme="vs"
        selectedFile={file}
        workspaceId="demo"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: /version history information/i })
    );

    expect(
      screen.getByRole("dialog", { name: /^version history$/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/manual checkpoints/i)).toBeInTheDocument();
    expect(screen.getByText(/close and reopen this panel/i)).toBeInTheDocument();
  });

  it("previews a selected version without restoring live content", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        await jsonResponse({
          versions: [
            {
              id: "7",
              fileId: "main.ts",
              name: "Before refactor",
              createdAt: "2026-08-30T15:00:00.000Z"
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        await jsonResponse({
          id: "7",
          fileId: "main.ts",
          name: "Before refactor",
          createdAt: "2026-08-30T15:00:00.000Z",
          content: "const old = true;"
        })
      );

    render(
      <FileVersionHistoryPanel
        isMonacoReady
        monacoTheme="vs"
        selectedFile={file}
        workspaceId="demo"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );

    await userEvent.click(await screen.findByRole("button", { name: /2026/i }));

    expect(await screen.findByTestId("version-preview")).toHaveTextContent(
      "const old = true;"
    );
    expect(screen.queryByText("const current = true;")).not.toBeInTheDocument();
  });

  it("requires confirmation before restoring a version", async () => {
    const onRestored = vi.fn();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        await jsonResponse({
          versions: [
            {
              id: "7",
              fileId: "main.ts",
              name: null,
              createdAt: "2026-08-30T15:00:00.000Z"
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        await jsonResponse({
          id: "7",
          fileId: "main.ts",
          name: null,
          createdAt: "2026-08-30T15:00:00.000Z",
          content: "const old = true;"
        })
      )
      .mockResolvedValueOnce(await jsonResponse({ file, version: { id: "7" } }));

    render(
      <FileVersionHistoryPanel
        isMonacoReady
        monacoTheme="vs"
        selectedFile={file}
        workspaceId="demo"
        onClose={vi.fn()}
        onRestored={onRestored}
      />
    );

    await userEvent.click(await screen.findByRole("button", { name: /2026/i }));
    await userEvent.click(
      await screen.findByRole("button", { name: /restore this version/i })
    );

    expect(screen.getByRole("heading", { name: /restore this version/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole("button", { name: /^restore$/i }));

    await waitFor(() => {
      expect(onRestored).toHaveBeenCalled();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("saves a named manual version and updates the list", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(await jsonResponse({ versions: [] }))
      .mockResolvedValueOnce(
        await jsonResponse(
          {
            version: {
              id: "8",
              fileId: "main.ts",
              name: "Before demo",
              createdAt: "2026-08-30T16:00:00.000Z"
            }
          },
          true,
          201
        )
      );

    render(
      <FileVersionHistoryPanel
        isMonacoReady
        monacoTheme="vs"
        selectedFile={file}
        workspaceId="demo"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /save version/i }));
    await userEvent.type(screen.getByLabelText(/version name optional/i), "Before demo");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText("Before demo")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("/api/workspaces/demo/files/main.ts/versions"),
      expect.objectContaining({
        body: JSON.stringify({ name: "Before demo" }),
        method: "POST"
      })
    );
  });

  it("deletes a saved version after confirmation", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        await jsonResponse({
          versions: [
            {
              id: "9",
              fileId: "main.ts",
              name: "Remove me",
              createdAt: "2026-08-30T17:00:00.000Z"
            }
          ]
        })
      )
      .mockResolvedValueOnce({
        json: () => Promise.resolve({}),
        ok: true,
        status: 204
      } as Response);

    render(
      <FileVersionHistoryPanel
        isMonacoReady
        monacoTheme="vs"
        selectedFile={file}
        workspaceId="demo"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );

    expect(await screen.findByText("Remove me")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /delete remove me/i }));
    expect(
      screen.getByRole("heading", { name: /delete this version/i })
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(screen.queryByText("Remove me")).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("/api/workspaces/demo/files/main.ts/versions/9"),
      expect.objectContaining({ method: "DELETE" })
    );
  });
});
