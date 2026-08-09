import { describe, expect, it } from "vitest";
import { extractResponseText } from "./azureAiClient.js";

describe("Azure AI client", () => {
  it("reads direct response output text", () => {
    expect(
      extractResponseText({
        output_text: " Fixed code "
      })
    ).toBe("Fixed code");
  });

  it("reads structured response output text", () => {
    expect(
      extractResponseText({
        output: [
          {
            content: [
              {
                text: "First section"
              },
              {
                text: "Second section"
              }
            ]
          }
        ]
      })
    ).toBe("First section\n\nSecond section");
  });

  it("returns an empty string when no text is present", () => {
    expect(
      extractResponseText({
        output: [
          {
            content: [{ type: "refusal" }]
          }
        ]
      })
    ).toBe("");
  });
});
