import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isExecutableLanguage,
  runCode
} from "./codeExecution";
import type { WorkspaceFile } from "./types";

const selectedFile: WorkspaceFile = {
  content: "console.log('hello');",
  fileId: "main.js",
  fileName: "main.js",
  language: "javascript"
};

const files: WorkspaceFile[] = [
  selectedFile,
  {
    content: "export const value = 1;",
    fileId: "utils.js",
    fileName: "utils.js",
    language: "javascript"
  }
];

describe("code execution client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detects executable languages", () => {
    expect(isExecutableLanguage("javascript")).toBe(true);
    expect(isExecutableLanguage("typescript")).toBe(true);
    expect(isExecutableLanguage("python")).toBe(true);
    expect(isExecutableLanguage("markdown")).toBe(false);
  });

  it("sends the active file and workspace files to the backend", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: () =>
        Promise.resolve({
          status: "success",
          stderr: "",
          stdout: "hello\n"
        }),
      ok: true
    } as Response);

    await runCode(
      "workspace-1",
      selectedFile,
      files,
      "stdin text",
      new AbortController().signal
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/execution/run",
      expect.objectContaining({
        credentials: "omit",
        method: "POST"
      })
    );
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      activeFileId: "main.js",
      language: "javascript",
      stdin: "stdin text",
      workspaceId: "workspace-1"
    });
  });

  it("returns friendly backend errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: () => Promise.resolve({ error: "Unsupported language." }),
      ok: false
    } as Response);

    await expect(
      runCode("workspace-1", selectedFile, files, "", new AbortController().signal)
    ).rejects.toThrow(/unsupported language/i);
  });
});
