import { describe, expect, it } from "vitest";
import { buildAiPrompt } from "./aiPrompts.js";

describe("AI prompts", () => {
  it("asks test generation responses to use structured Markdown and code fences", () => {
    const prompt = buildAiPrompt({
      action: "tests",
      code: "export function add(a: number, b: number) { return a + b; }",
      fileName: "math.ts",
      language: "typescript"
    });

    expect(prompt).toContain("Return valid Markdown");
    expect(prompt).toContain("Use headings, bullets, and fenced code blocks");
    expect(prompt).toContain("Assumption, Test Cases, Test Code");
    expect(prompt).toContain("fenced code block");
  });
});
