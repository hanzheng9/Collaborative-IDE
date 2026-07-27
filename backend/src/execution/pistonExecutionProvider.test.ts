import { afterEach, describe, expect, it, vi } from "vitest";
import { PistonExecutionProvider } from "./pistonExecutionProvider.js";

describe("PistonExecutionProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts to the configured Piston execute endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          run: {
            code: 0,
            stderr: "",
            stdout: "hello\n"
          }
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new PistonExecutionProvider({
      apiKey: "test-key",
      apiUrl: "https://emkc.org/api/v2/piston",
      requestTimeoutMs: 1000
    });

    const result = await provider.run({
      files: [{ content: "console.log('hello');", name: "main.js" }],
      language: "javascript",
      timeoutMs: 500,
      version: "18.15.0"
    });

    expect(result).toMatchObject({
      status: "success",
      stdout: "hello\n"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://emkc.org/api/v2/piston/execute",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-key"
        }),
        method: "POST"
      })
    );
  });

  it("accepts a full execute URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ run: { code: 0 } }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new PistonExecutionProvider({
      apiUrl: "http://localhost:2000/api/v2/execute",
      requestTimeoutMs: 1000
    });

    await provider.run({
      files: [{ content: "print('hello')", name: "main.py" }],
      language: "python",
      timeoutMs: 500,
      version: "3.10.0"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:2000/api/v2/execute",
      expect.any(Object)
    );
  });
});
