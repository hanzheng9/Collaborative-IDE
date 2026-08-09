import { describe, expect, it, vi } from "vitest";
import { WorkspaceService, type WorkspacePersistence } from "./workspaceService.js";

describe("WorkspaceService lifecycle", () => {
  it("touches workspace activity on persisted joins", async () => {
    const touchWorkspace = vi.fn().mockResolvedValue(undefined);
    const service = new WorkspaceService({
      persistence: {
        loadWorkspace: async () => ({
          files: [
            {
              fileId: "main.ts",
              fileName: "main.ts",
              language: "typescript",
              content: ""
            }
          ],
          name: "Learning Workspace"
        }),
        touchWorkspace
      }
    });

    await expect(service.loadWorkspace("demo")).resolves.toEqual({ ok: true });
    expect(service.getWorkspaceState("demo").name).toBe("Learning Workspace");
    expect(touchWorkspace).toHaveBeenCalledWith("demo");
  });

  it("does not create missing persisted workspaces unless requested", async () => {
    const createWorkspace = vi.fn();
    const service = new WorkspaceService({
      persistence: {
        createWorkspace,
        loadWorkspace: async () => null
      }
    });

    await expect(service.loadWorkspace("expired")).resolves.toMatchObject({
      ok: false,
      code: "WORKSPACE_NOT_FOUND"
    });
    expect(createWorkspace).not.toHaveBeenCalled();
    expect(service.workspaces.hasWorkspace("expired")).toBe(false);
  });

  it("creates default files for explicit workspace creation", async () => {
    const createWorkspace = vi.fn().mockResolvedValue(undefined);
    const service = new WorkspaceService({
      persistence: {
        createWorkspace,
        loadWorkspace: async () => null
      }
    });

    await expect(
      service.loadWorkspace("new-workspace", { createIfMissing: true })
    ).resolves.toEqual({ ok: true });
    expect(createWorkspace).toHaveBeenCalledWith(
      "new-workspace",
      expect.arrayContaining([
        expect.objectContaining({
          fileId: "main.ts",
          fileName: "main.ts"
        })
      ])
    );
  });

  it("tracks activity for file creation, rename, delete, and debounced content save", async () => {
    vi.useFakeTimers();
    const persistence: WorkspacePersistence = {
      deleteFile: vi.fn().mockResolvedValue(undefined),
      saveFile: vi.fn().mockResolvedValue(undefined),
      saveFileContent: vi.fn().mockResolvedValue(undefined),
      renameFile: vi.fn().mockResolvedValue(undefined)
    };
    const service = new WorkspaceService({
      contentWriteDelayMs: 25,
      persistence
    });
    await service.loadWorkspace("demo", { createIfMissing: true });

    const created = service.createFile({
      workspaceId: "demo",
      fileName: "utils.ts"
    });
    expect(created.ok).toBe(true);
    await vi.runAllTimersAsync();
    expect(persistence.saveFile).toHaveBeenCalledOnce();

    if (!created.ok) {
      throw new Error("file was not created");
    }

    service.renameFile({
      workspaceId: "demo",
      fileId: created.file.fileId,
      fileName: "helpers.ts"
    });
    await vi.runAllTimersAsync();
    expect(persistence.renameFile).toHaveBeenCalledOnce();

    service.updateFileContent({
      workspaceId: "demo",
      fileId: created.file.fileId,
      code: "console.log('latest');"
    });
    await vi.advanceTimersByTimeAsync(25);
    expect(persistence.saveFileContent).toHaveBeenCalledWith(
      "demo",
      created.file.fileId,
      "console.log('latest');"
    );

    service.deleteFile({
      workspaceId: "demo",
      fileId: created.file.fileId
    });
    await vi.runAllTimersAsync();
    expect(persistence.deleteFile).toHaveBeenCalledWith(
      "demo",
      created.file.fileId
    );
    vi.useRealTimers();
  });

  it("renames a workspace in memory and persists the normalized name", async () => {
    const renameWorkspace = vi.fn().mockResolvedValue(undefined);
    const service = new WorkspaceService({
      persistence: { renameWorkspace }
    });
    await service.loadWorkspace("demo", { createIfMissing: true });

    const result = service.renameWorkspace({
      workspaceId: "demo",
      name: "  Portfolio IDE  "
    });

    expect(result).toEqual({ ok: true, name: "Portfolio IDE" });
    expect(service.getWorkspaceState("demo").name).toBe("Portfolio IDE");
    expect(renameWorkspace).toHaveBeenCalledWith("demo", "Portfolio IDE");
  });

  it("validates workspace rename input", async () => {
    const renameWorkspace = vi.fn().mockResolvedValue(undefined);
    const service = new WorkspaceService({
      persistence: { renameWorkspace }
    });
    await service.loadWorkspace("demo", { createIfMissing: true });

    expect(
      service.renameWorkspace({
        workspaceId: "demo",
        name: "   "
      })
    ).toEqual({ ok: true, name: "Untitled Workspace" });
    expect(service.getWorkspaceState("demo").name).toBe("Untitled Workspace");

    const tooLong = service.renameWorkspace({
      workspaceId: "demo",
      name: "x".repeat(101)
    });

    expect(tooLong).toMatchObject({
      ok: false,
      code: "INVALID_WORKSPACE_NAME"
    });
  });

  it("does not persist cursor-only activity", async () => {
    const touchWorkspace = vi.fn();
    const service = new WorkspaceService({
      persistence: { touchWorkspace }
    });

    service.workspaces.getWorkspaceFiles("demo");

    expect(service.hasFile("demo", "main.ts")).toBe(true);
    expect(touchWorkspace).not.toHaveBeenCalled();
  });
});
