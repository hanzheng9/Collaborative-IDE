import { afterEach, describe, expect, it, vi } from "vitest";
import { Judge0ExecutionProvider } from "./judge0ExecutionProvider.js";

describe("Judge0ExecutionProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits source, polls by token, and normalizes successful output", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: "submission-token" }), {
          status: 201
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: { id: 2, description: "Processing" }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            exit_code: 0,
            status: { id: 3, description: "Accepted" },
            stderr: "",
            stdout: "hello\n",
            time: "0.01"
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new Judge0ExecutionProvider({
      apiHost: "judge0-ce.p.rapidapi.com",
      apiKey: "rapid-key",
      apiUrl: "https://judge0-ce.p.rapidapi.com",
      requestTimeoutMs: 3000,
      reserveMonthlyExecution: async () => ({ allowed: true, executionCount: 1 })
    });

    const result = await provider.run({
      files: [{ content: "console.log('hello');", name: "main.js" }],
      judge0LanguageId: 63,
      language: "javascript",
      timeoutMs: 1000
    });

    expect(result).toMatchObject({
      durationMs: 10,
      status: "success",
      stdout: "hello\n"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=false",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
          "X-RapidAPI-Key": "rapid-key"
        }),
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://judge0-ce.p.rapidapi.com/submissions/submission-token?base64_encoded=false",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("blocks before submitting when the monthly cap is reached", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = new Judge0ExecutionProvider({
      apiKey: "rapid-key",
      apiUrl: "https://judge0-ce.p.rapidapi.com",
      monthlyLimit: 1500,
      requestTimeoutMs: 1000,
      reserveMonthlyExecution: async () => ({
        allowed: false,
        executionCount: 1500
      })
    });

    const result = await provider.run({
      files: [{ content: "print('hello')", name: "main.py" }],
      judge0LanguageId: 71,
      language: "python",
      timeoutMs: 1000
    });

    expect(result).toMatchObject({
      status: "provider_error",
      stderr: expect.stringMatching(/monthly execution limit reached/i)
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
