import { describe, expect, it } from "vitest";
import { WorkspaceStateStore } from "./workspaceState.js";

describe("WorkspaceStateStore", () => {
  it("creates and retrieves a default workspace", () => {
    const store = new WorkspaceStateStore();
    const state = store.getWorkspaceState("demo");

    expect(state.files).toHaveLength(1);
    expect(state.files[0]).toMatchObject({
      fileId: "main.ts",
      fileName: "main.ts",
      language: "typescript"
    });
    expect(store.getWorkspaceState("demo")).toEqual(state);
  });

  it("creates files with trimmed names, stable unique ids, and language", () => {
    let id = 0;
    const store = new WorkspaceStateStore({
      generateFileId: () => `file-${++id}`
    });

    const result = store.createFile("demo", "  utils.ts  ");

    expect(result).toMatchObject({
      ok: true,
      file: {
        fileId: "file-1",
        fileName: "utils.ts",
        language: "typescript",
        content: ""
      }
    });
  });

  it("rejects empty and duplicate file creation", () => {
    const store = new WorkspaceStateStore();

    expect(store.createFile("demo", " ")).toMatchObject({ ok: false });
    expect(store.createFile("demo", "main.ts")).toMatchObject({ ok: false });
    expect(store.createFile("demo", "MAIN.TS")).toMatchObject({ ok: false });
  });

  it("renames a file without changing id or content", () => {
    const store = new WorkspaceStateStore({ generateFileId: () => "file-1" });
    const created = store.createFile("demo", "utils.ts");

    expect(created.ok).toBe(true);
    if (!created.ok) return;

    store.updateFileContent({
      workspaceId: "demo",
      fileId: created.file.fileId,
      code: "export const value = 1;"
    });
    const renamed = store.renameFile("demo", created.file.fileId, "helper.js");

    expect(renamed).toMatchObject({
      ok: true,
      file: {
        fileId: "file-1",
        fileName: "helper.js",
        language: "javascript",
        content: "export const value = 1;"
      }
    });
  });

  it("rejects invalid renames safely", () => {
    const store = new WorkspaceStateStore();

    expect(store.renameFile("demo", "main.ts", " ")).toMatchObject({
      ok: false
    });
    store.createFile("demo", "utils.ts");
    expect(store.renameFile("demo", "main.ts", "utils.ts")).toMatchObject({
      ok: false
    });
    expect(store.renameFile("demo", "missing.ts", "other.ts")).toMatchObject({
      ok: false
    });
  });

  it("updates content by fileId without modifying other files", () => {
    const store = new WorkspaceStateStore({ generateFileId: () => "file-1" });
    const created = store.createFile("demo", "utils.ts");

    expect(created.ok).toBe(true);
    if (!created.ok) return;

    store.updateFileContent({
      workspaceId: "demo",
      fileId: created.file.fileId,
      code: "const util = true;"
    });

    const state = store.getWorkspaceState("demo");
    expect(state.files.find((file) => file.fileId === "file-1")?.content).toBe(
      "const util = true;"
    );
    expect(state.files.find((file) => file.fileId === "main.ts")?.content).not.toBe(
      "const util = true;"
    );
  });

  it("deletes a file by stable fileId and chooses a fallback", () => {
    let id = 0;
    const store = new WorkspaceStateStore({
      generateFileId: () => `file-${++id}`
    });
    const first = store.createFile("demo", "first.ts");
    const second = store.createFile("demo", "second.ts");

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const deleted = store.deleteFile("demo", first.file.fileId);

    expect(deleted).toMatchObject({
      ok: true,
      deletedFileId: first.file.fileId,
      fallbackFileId: second.file.fileId
    });
    expect(
      store.getWorkspaceState("demo").files.some(
        (file) => file.fileId === first.file.fileId
      )
    ).toBe(false);
  });

  it("prevents deleting the final remaining file", () => {
    const store = new WorkspaceStateStore();

    expect(store.deleteFile("demo", "main.ts")).toMatchObject({
      ok: false,
      code: "CANNOT_DELETE_LAST_FILE"
    });
    expect(store.deleteFile("demo", "missing.ts")).toMatchObject({
      ok: false,
      code: "FILE_NOT_FOUND"
    });
  });

  it("returns latest state for later joiners and handles unknown files safely", () => {
    const store = new WorkspaceStateStore();

    store.updateFileContent({
      workspaceId: "demo",
      fileId: "main.ts",
      code: "latest"
    });

    expect(store.getWorkspaceState("demo").files[0]?.content).toBe("latest");
    expect(
      store.updateFileContent({
        workspaceId: "demo",
        fileId: "missing.ts",
        code: "nope"
      })
    ).toMatchObject({ ok: false });
  });
});
