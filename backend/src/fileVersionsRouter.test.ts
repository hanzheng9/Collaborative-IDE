import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createFileVersionsRouter } from "./fileVersionsRouter.js";
import { WorkspaceService } from "./services/workspaceService.js";
import type { CodeChangePayload } from "./types.js";

function createTestApp(options: {
  getFileVersion?: (
    workspaceId: string,
    fileId: string,
    versionId: string
  ) => Promise<{
    id: string;
    fileId: string;
    name: string | null;
    createdAt: string;
    content: string;
  } | null>;
  getFileVersions?: (
    workspaceId: string,
    fileId: string
  ) => Promise<Array<{ id: string; fileId: string; name: string | null; createdAt: string }>>;
  service?: WorkspaceService;
  broadcast?: (payload: CodeChangePayload) => void;
  deleteFileVersion?: (
    workspaceId: string,
    fileId: string,
    versionId: string
  ) => Promise<boolean>;
} = {}) {
  const app = express();
  const service = options.service ?? new WorkspaceService();
  const getFileVersions =
    options.getFileVersions ??
    vi.fn().mockResolvedValue([
      {
        id: "2",
        fileId: "main.ts",
        name: "Working version",
        createdAt: "2026-08-30T12:00:00.000Z"
      }
    ]);
  const getFileVersion =
    options.getFileVersion ??
    vi.fn().mockResolvedValue({
      id: "2",
      fileId: "main.ts",
      name: "Working version",
      createdAt: "2026-08-30T12:00:00.000Z",
      content: "const restored = true;"
    });
  const broadcast = options.broadcast ?? vi.fn();
  const deleteFileVersion =
    options.deleteFileVersion ?? vi.fn().mockResolvedValue(true);

  app.use(express.json());
  app.use(
    "/api/workspaces",
    createFileVersionsRouter({
      broadcastCodeChange: broadcast,
      deleteFileVersion,
      getFileVersion,
      getFileVersions,
      workspaceService: service
    })
  );

  return {
    app,
    broadcast,
    deleteFileVersion,
    getFileVersion,
    getFileVersions,
    service
  };
}

describe("file version history router", () => {
  it("lists versions newest first metadata for an existing file", async () => {
    const setup = createTestApp();
    await setup.service.loadWorkspace("demo", { createIfMissing: true });

    const response = await request(setup.app)
      .get("/api/workspaces/demo/files/main.ts/versions")
      .expect(200);

    expect(response.body).toEqual({
      versions: [
        {
          id: "2",
          fileId: "main.ts",
          name: "Working version",
          createdAt: "2026-08-30T12:00:00.000Z"
        }
      ]
    });
    expect(setup.getFileVersions).toHaveBeenCalledWith("demo", "main.ts");
  });

  it("creates a named manual version from authoritative memory content", async () => {
    const createFileVersion = vi.fn().mockResolvedValue({
      id: "3",
      fileId: "main.ts",
      name: "Before refactor",
      createdAt: "2026-08-30T13:00:00.000Z"
    });
    const service = new WorkspaceService({
      persistence: { createFileVersion }
    });
    const setup = createTestApp({ service });
    await service.loadWorkspace("demo", { createIfMissing: true });
    service.updateFileContent({
      workspaceId: "demo",
      fileId: "main.ts",
      code: "const memory = true;"
    });

    const response = await request(setup.app)
      .post("/api/workspaces/demo/files/main.ts/versions")
      .send({ name: "  Before refactor  " })
      .expect(201);

    expect(response.body.version.name).toBe("Before refactor");
    expect(createFileVersion).toHaveBeenCalledWith(
      "demo",
      "main.ts",
      "const memory = true;",
      "Before refactor"
    );
  });

  it("creates an unnamed manual version from blank input", async () => {
    const createFileVersion = vi.fn().mockResolvedValue({
      id: "4",
      fileId: "main.ts",
      name: null,
      createdAt: "2026-08-30T14:00:00.000Z"
    });
    const service = new WorkspaceService({
      persistence: { createFileVersion }
    });
    const setup = createTestApp({ service });
    await service.loadWorkspace("demo", { createIfMissing: true });

    await request(setup.app)
      .post("/api/workspaces/demo/files/main.ts/versions")
      .send({ name: "   " })
      .expect(201);

    expect(createFileVersion).toHaveBeenCalledWith(
      "demo",
      "main.ts",
      expect.any(String),
      null
    );
  });

  it("rejects overly long version names", async () => {
    const setup = createTestApp();
    await setup.service.loadWorkspace("demo", { createIfMissing: true });

    const response = await request(setup.app)
      .post("/api/workspaces/demo/files/main.ts/versions")
      .send({ name: "x".repeat(101) })
      .expect(400);

    expect(response.body.error).toBe("Version names must be 100 characters or less.");
  });

  it("does not return a version through the wrong file", async () => {
    const setup = createTestApp({
      getFileVersion: vi.fn().mockResolvedValue(null)
    });
    await setup.service.loadWorkspace("demo", { createIfMissing: true });

    const response = await request(setup.app)
      .get("/api/workspaces/demo/files/main.ts/versions/42")
      .expect(404);

    expect(response.body.error).toBe("Version not found.");
  });

  it("restores a version through memory and broadcasts code-change", async () => {
    const setup = createTestApp();
    await setup.service.loadWorkspace("demo", { createIfMissing: true });
    setup.service.updateFileContent({
      workspaceId: "demo",
      fileId: "main.ts",
      code: "const current = true;"
    });

    const response = await request(setup.app)
      .post("/api/workspaces/demo/files/main.ts/versions/2/restore")
      .expect(200);

    expect(response.body.file.content).toBe("const restored = true;");
    expect(setup.service.getWorkspaceState("demo").files[0].content).toBe(
      "const restored = true;"
    );
    expect(setup.broadcast).toHaveBeenCalledWith({
      workspaceId: "demo",
      fileId: "main.ts",
      code: "const restored = true;"
    });
  });

  it("deletes a version without broadcasting a code change", async () => {
    const setup = createTestApp();
    await setup.service.loadWorkspace("demo", { createIfMissing: true });

    await request(setup.app)
      .delete("/api/workspaces/demo/files/main.ts/versions/2")
      .expect(204);

    expect(setup.deleteFileVersion).toHaveBeenCalledWith(
      "demo",
      "main.ts",
      "2"
    );
    expect(setup.broadcast).not.toHaveBeenCalled();
  });

  it("returns 404 when deleting a mismatched version", async () => {
    const setup = createTestApp({
      deleteFileVersion: vi.fn().mockResolvedValue(false)
    });
    await setup.service.loadWorkspace("demo", { createIfMissing: true });

    const response = await request(setup.app)
      .delete("/api/workspaces/demo/files/main.ts/versions/999")
      .expect(404);

    expect(response.body.error).toBe("Version not found.");
  });

  it("rejects malformed IDs", async () => {
    const setup = createTestApp();

    const response = await request(setup.app)
      .get("/api/workspaces/bad id/files/main.ts/versions")
      .expect(400);

    expect(response.body.error).toBe("Invalid workspace ID.");
  });
});
