import { describe, expect, it } from "vitest";
import { validateFileName } from "./filename.js";
import type { WorkspaceFile } from "./types.js";

const files: WorkspaceFile[] = [
  {
    fileId: "main.ts",
    fileName: "main.ts",
    language: "typescript",
    content: ""
  }
];

describe("validateFileName", () => {
  it("accepts a valid filename and trims whitespace", () => {
    expect(validateFileName("  utils.ts  ", files)).toEqual({
      ok: true,
      fileName: "utils.ts"
    });
  });

  it.each(["", "   "])("rejects empty filename %j", (fileName) => {
    expect(validateFileName(fileName, files)).toEqual({
      ok: false,
      code: "INVALID_FILENAME",
      error: "Filename is required."
    });
  });

  it("rejects duplicate filenames case-insensitively", () => {
    expect(validateFileName("MAIN.TS", files)).toEqual({
      ok: false,
      code: "DUPLICATE_FILENAME",
      error: "A file with that name already exists."
    });
  });

  it("allows the current file to keep its own name during rename", () => {
    expect(validateFileName("MAIN.TS", files, "main.ts")).toEqual({
      ok: true,
      fileName: "MAIN.TS"
    });
  });

  it.each([
    "very-long-file-name-that-is-still-valid-for-this-prototype.ts",
    "one.two.three.ts",
    "Dockerfile",
    "styles.css"
  ])("accepts %s", (fileName) => {
    expect(validateFileName(fileName, files)).toMatchObject({ ok: true });
  });
});
