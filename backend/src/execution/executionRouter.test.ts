import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { WorkspaceService } from "../services/workspaceService.js";
import type { WorkspaceFile } from "../types.js";
import { WorkspaceStateStore } from "../workspaceState.js";
import { ExecutionService } from "./executionService.js";
import type { ExecutionProvider } from "./executionProvider.js";
import type {
  ExecutionProviderRequest,
  ExecutionResult
} from "./executionTypes.js";

const workspaceId = "test-workspace";
const workspaceFiles: WorkspaceFile[] = [
  {
    content: "console.log('hello');",
    fileId: "main.js",
    fileName: "main.js",
    language: "javascript"
  },
  {
    content: "print('hello')",
    fileId: "main.py",
    fileName: "main.py",
    language: "python"
  },
  {
    content: "const value: number = 1;",
    fileId: "main.ts",
    fileName: "main.ts",
    language: "typescript"
  }
];

class MockExecutionProvider implements ExecutionProvider {
  requests: ExecutionProviderRequest[] = [];

  constructor(private readonly result: ExecutionResult) {}

  async run(request: ExecutionProviderRequest) {
    this.requests.push(request);
    return this.result;
  }
}

function createExecutionApp(provider: MockExecutionProvider, rateLimitMax = 100) {
  const workspaces = new WorkspaceStateStore();
  workspaces.setWorkspaceFiles(workspaceId, workspaceFiles);
  const workspaceService = new WorkspaceService({ workspaces });
  const executionService = new ExecutionService({
    provider,
    workspaceService
  });

  return createApp({
    executionRateLimitMax: rateLimitMax,
    executionRateLimitWindowMs: 60000,
    executionService
  });
}

function runBody(overrides: Record<string, unknown> = {}) {
  return {
    activeFileId: "main.js",
    files: workspaceFiles.map((file) => ({
      content: file.content,
      name: file.fileName
    })),
    language: "javascript",
    workspaceId,
    ...overrides
  };
}

describe("code execution route", () => {
  it("runs JavaScript successfully", async () => {
    const provider = new MockExecutionProvider({
      exitCode: 0,
      status: "success",
      stderr: "",
      stdout: "hello\n"
    });

    await request(createExecutionApp(provider))
      .post("/api/execution/run")
      .send(runBody())
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: "success",
          stdout: "hello\n"
        });
      });
    expect(provider.requests[0]).toMatchObject({
      language: "javascript",
      stdin: undefined
    });
  });

  it("runs Python and passes standard input", async () => {
    const provider = new MockExecutionProvider({
      exitCode: 0,
      status: "success",
      stderr: "",
      stdout: "hello\n"
    });

    await request(createExecutionApp(provider))
      .post("/api/execution/run")
      .send(
        runBody({
          activeFileId: "main.py",
          language: "python",
          stdin: "input text"
        })
      )
      .expect(200);
    expect(provider.requests[0]).toMatchObject({
      language: "python",
      stdin: "input text"
    });
  });

  it("maps TypeScript to the TypeScript runtime", async () => {
    const provider = new MockExecutionProvider({
      exitCode: 0,
      status: "success",
      stderr: "",
      stdout: ""
    });

    await request(createExecutionApp(provider))
      .post("/api/execution/run")
      .send(
        runBody({
          activeFileId: "main.ts",
          language: "typescript"
        })
      )
      .expect(200);
    expect(provider.requests[0]).toMatchObject({
      language: "typescript"
    });
  });

  it.each([
    ["compile_error", "Compilation failed"],
    ["runtime_error", "Runtime exploded"],
    ["timeout", "Execution timed out"]
  ] as const)("normalizes %s", async (status, stderr) => {
    const provider = new MockExecutionProvider({
      status,
      stderr,
      stdout: ""
    });

    await request(createExecutionApp(provider))
      .post("/api/execution/run")
      .send(runBody())
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status, stderr });
      });
  });

  it("rejects unsupported language and empty code", async () => {
    const provider = new MockExecutionProvider({
      status: "success",
      stderr: "",
      stdout: ""
    });
    const app = createExecutionApp(provider);

    await request(app)
      .post("/api/execution/run")
      .send(runBody({ language: "ruby" }))
      .expect(400);
    await request(app)
      .post("/api/execution/run")
      .send(runBody({ files: [{ name: "main.js", content: "" }] }))
      .expect(400);
  });

  it("rejects oversized payloads, too many files, path traversal, and secrets", async () => {
    const provider = new MockExecutionProvider({
      status: "success",
      stderr: "",
      stdout: ""
    });
    const app = createExecutionApp(provider);

    await request(app)
      .post("/api/execution/run")
      .send(runBody({ files: [{ name: "main.js", content: "x".repeat(70000) }] }))
      .expect(400);
    await request(app)
      .post("/api/execution/run")
      .send(
        runBody({
          files: Array.from({ length: 21 }, (_value, index) => ({
            content: "console.log(1);",
            name: `file-${index}.js`
          }))
        })
      )
      .expect(400);
    await request(app)
      .post("/api/execution/run")
      .send(runBody({ files: [{ name: "../main.js", content: "x" }] }))
      .expect(400);
    await request(app)
      .post("/api/execution/run")
      .send(runBody({ files: [{ name: ".env", content: "SECRET=1" }] }))
      .expect(400);
  });

  it("validates workspace and active file membership", async () => {
    const provider = new MockExecutionProvider({
      status: "success",
      stderr: "",
      stdout: ""
    });
    const app = createExecutionApp(provider);

    await request(app)
      .post("/api/execution/run")
      .send(runBody({ workspaceId: "" }))
      .expect(400);
    await request(app)
      .post("/api/execution/run")
      .send(runBody({ activeFileId: "missing.js" }))
      .expect(400)
      .expect(({ body }) => {
        expect(body.error).not.toMatch(/PISTON|TOKEN|KEY|http/i);
      });
  });

  it("truncates large output", async () => {
    const provider = new MockExecutionProvider({
      status: "success",
      stderr: "",
      stdout: "x".repeat(60000)
    });

    await request(createExecutionApp(provider))
      .post("/api/execution/run")
      .send(runBody())
      .expect(200)
      .expect(({ body }) => {
        expect(body.stdout.length).toBeLessThan(60000);
        expect(body.stdout).toMatch(/Output truncated/);
      });
  });

  it("handles provider unavailable and route rate limiting", async () => {
    const provider = new MockExecutionProvider({
      status: "provider_error",
      stderr: "private provider url",
      stdout: ""
    });
    const app = createExecutionApp(provider, 1);

    await request(app)
      .post("/api/execution/run")
      .send(runBody())
      .expect(503)
      .expect(({ body }) => {
        expect(body.error).toMatch(/unavailable/i);
        expect(body.error).not.toMatch(/private provider url/i);
      });
    await request(app)
      .post("/api/execution/run")
      .send(runBody())
      .expect(429);
  });

  it("returns a user-facing 429 when the monthly execution cap is reached", async () => {
    const provider = new MockExecutionProvider({
      status: "provider_error",
      stderr:
        "Monthly execution limit reached.\n\nTo keep the public demo available, code execution has been temporarily disabled.\n\nThe limit resets automatically at the beginning of next month.",
      stdout: ""
    });

    await request(createExecutionApp(provider))
      .post("/api/execution/run")
      .send(runBody())
      .expect(429)
      .expect(({ body }) => {
        expect(body.error).toMatch(/monthly execution limit reached/i);
        expect(body.error).toMatch(/resets automatically/i);
      });
  });
});
