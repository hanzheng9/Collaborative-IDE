import { describe, expect, it } from "vitest";
import { getLanguageForFile } from "./language.js";

describe("getLanguageForFile", () => {
  it.each([
    ["main.ts", "typescript"],
    ["component.tsx", "typescript"],
    ["app.js", "javascript"],
    ["view.jsx", "javascript"],
    ["script.py", "python"],
    ["Service.java", "java"],
    ["server.go", "go"],
    ["native.c", "c"],
    ["native.cpp", "cpp"],
    ["index.html", "html"],
    ["styles.css", "css"],
    ["data.json", "json"],
    ["README.md", "markdown"],
    ["query.sql", "sql"],
    ["UPPER.TS", "typescript"],
    ["no-extension", "plaintext"],
    ["archive.unknown", "plaintext"]
  ])("detects %s as %s", (fileName, language) => {
    expect(getLanguageForFile(fileName)).toBe(language);
  });
});
