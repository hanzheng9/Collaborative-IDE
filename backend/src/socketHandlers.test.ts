import { createServer, type Server as HttpServer } from "node:http";
import { AddressInfo } from "node:net";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { registerSocketHandlers } from "./socketHandlers.js";
import { WorkspaceStateStore } from "./workspaceState.js";

function waitForEvent<T>(socket: ClientSocket, event: string, timeoutMs = 1000) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const onEvent = (payload: T) => {
      clearTimeout(timeout);
      resolve(payload);
    };

    socket.once(event, onEvent);
  });
}

function waitForEventWhere<T>(
  socket: ClientSocket,
  event: string,
  predicate: (payload: T) => boolean,
  timeoutMs = 1000
) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const onEvent = (payload: T) => {
      if (!predicate(payload)) {
        return;
      }

      clearTimeout(timeout);
      socket.off(event, onEvent);
      resolve(payload);
    };

    socket.on(event, onEvent);
  });
}

describe("Socket.io collaboration", () => {
  let httpServer: HttpServer;
  let ioServer: Server;
  let url: string;
  let clients: ClientSocket[];
  let workspaces: WorkspaceStateStore;

  beforeEach(async () => {
    httpServer = createServer(createApp());
    ioServer = new Server(httpServer);
    workspaces = new WorkspaceStateStore({
      generateFileId: () => `file-${Date.now()}-${Math.random()}`
    });
    registerSocketHandlers(ioServer, {
      contentWriteDelayMs: 5,
      workspaces
    });
    clients = [];

    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const address = httpServer.address() as AddressInfo;
    url = `http://localhost:${address.port}`;
  });

  afterEach(async () => {
    clients.forEach((client) => client.disconnect());
    await new Promise<void>((resolve) => ioServer.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function client() {
    const socket = createClient(url, {
      forceNew: true,
      reconnection: false
    });
    clients.push(socket);
    return socket;
  }

  it("sends current workspace state to early and late joiners", async () => {
    const a = client();
    await waitForEvent(a, "connect");
    a.emit("join-workspace", { workspaceId: "demo" });
    const aState = await waitForEvent<{ files: { fileId: string }[] }>(
      a,
      "workspace-state"
    );

    expect(aState.files.some((file) => file.fileId === "main.ts")).toBe(true);
    workspaces.updateFileContent({
      workspaceId: "demo",
      fileId: "main.ts",
      code: "latest code"
    });

    const b = client();
    await waitForEvent(b, "connect");
    b.emit("join-workspace", { workspaceId: "demo" });
    const bState = await waitForEvent<{ files: { content: string }[] }>(
      b,
      "workspace-state"
    );

    expect(bState.files[0]?.content).toBe("latest code");
  });

  it("broadcasts workspace renames to connected collaborators", async () => {
    const a = client();
    const b = client();
    await Promise.all([waitForEvent(a, "connect"), waitForEvent(b, "connect")]);
    a.emit("join-workspace", { workspaceId: "demo" });
    b.emit("join-workspace", { workspaceId: "demo" });
    await Promise.all([
      waitForEvent(a, "workspace-state"),
      waitForEvent(b, "workspace-state")
    ]);

    const renamed = waitForEvent<{ name: string; workspaceId: string }>(
      b,
      "workspace-renamed"
    );
    const ack = new Promise((resolve) => {
      a.emit(
        "rename-workspace",
        { workspaceId: "demo", name: "  Interview Prep  " },
        resolve
      );
    });

    await expect(ack).resolves.toEqual({ ok: true });
    await expect(renamed).resolves.toEqual({
      name: "Interview Prep",
      workspaceId: "demo"
    });
    expect(workspaces.getWorkspaceState("demo").name).toBe("Interview Prep");
  });

  it("broadcasts code changes only to other clients and updates one file", async () => {
    const a = client();
    const b = client();
    await Promise.all([waitForEvent(a, "connect"), waitForEvent(b, "connect")]);
    a.emit("join-workspace", { workspaceId: "demo" });
    b.emit("join-workspace", { workspaceId: "demo" });
    await Promise.all([
      waitForEvent(a, "workspace-state"),
      waitForEvent(b, "workspace-state")
    ]);

    const unexpectedSenderEvent = waitForEvent(a, "code-change", 150).then(
      () => true,
      () => false
    );
    const receiverEvent = waitForEvent<{ fileId: string; code: string }>(
      b,
      "code-change"
    );
    a.emit("code-change", {
      workspaceId: "demo",
      fileId: "main.ts",
      code: "changed"
    });

    expect(await receiverEvent).toMatchObject({
      fileId: "main.ts",
      code: "changed"
    });
    expect(await unexpectedSenderEvent).toBe(false);
    expect(workspaces.getWorkspaceState("demo").files[0]?.content).toBe("changed");
  });

  it("keeps separate workspaces isolated", async () => {
    const a = client();
    const b = client();
    await Promise.all([waitForEvent(a, "connect"), waitForEvent(b, "connect")]);
    a.emit("join-workspace", { workspaceId: "alpha-room" });
    b.emit("join-workspace", { workspaceId: "beta-room" });
    await Promise.all([
      waitForEvent(a, "workspace-state"),
      waitForEvent(b, "workspace-state")
    ]);

    const unexpectedCrossWorkspaceEvent = waitForEvent(b, "code-change", 150).then(
      () => true,
      () => false
    );
    a.emit("code-change", {
      workspaceId: "alpha-room",
      fileId: "main.ts",
      code: "alpha only"
    });

    expect(await unexpectedCrossWorkspaceEvent).toBe(false);
    expect(workspaces.getWorkspaceState("alpha-room").files[0]?.content).toBe(
      "alpha only"
    );
    expect(workspaces.getWorkspaceState("beta-room").files[0]?.content).not.toBe(
      "alpha only"
    );
  });

  it("syncs file creation, rejects duplicates, and syncs rename", async () => {
    const a = client();
    const b = client();
    await Promise.all([waitForEvent(a, "connect"), waitForEvent(b, "connect")]);
    a.emit("join-workspace", { workspaceId: "demo" });
    b.emit("join-workspace", { workspaceId: "demo" });
    await Promise.all([
      waitForEvent(a, "workspace-state"),
      waitForEvent(b, "workspace-state")
    ]);

    const createdEvent = waitForEvent<{ file: { fileId: string; fileName: string } }>(
      b,
      "file-created"
    );
    a.emit("create-file", { workspaceId: "demo", fileName: "utils.ts" });
    const created = await createdEvent;

    expect(created.file.fileId).toBeTruthy();
    expect(created.file.fileName).toBe("utils.ts");

    const duplicateError = waitForEvent<{ message: string }>(
      a,
      "file-operation-error"
    );
    a.emit("create-file", { workspaceId: "demo", fileName: "UTILS.TS" });
    expect((await duplicateError).message).toMatch(/already exists/i);

    workspaces.updateFileContent({
      workspaceId: "demo",
      fileId: created.file.fileId,
      code: "content"
    });
    const renamedEvent = waitForEvent<{ file: { fileId: string; fileName: string; content: string } }>(
      b,
      "file-renamed"
    );
    a.emit("rename-file", {
      workspaceId: "demo",
      fileId: created.file.fileId,
      fileName: "helpers.ts"
    });

    expect(await renamedEvent).toMatchObject({
      file: {
        fileId: created.file.fileId,
        fileName: "helpers.ts",
        content: "content"
      }
    });
  });

  it("broadcasts file deletion and prevents deleting the final file", async () => {
    const a = client();
    const b = client();
    await Promise.all([waitForEvent(a, "connect"), waitForEvent(b, "connect")]);
    a.emit("join-workspace", { workspaceId: "demo" });
    b.emit("join-workspace", { workspaceId: "demo" });
    await Promise.all([
      waitForEvent(a, "workspace-state"),
      waitForEvent(b, "workspace-state")
    ]);

    const createdEvent = waitForEvent<{ file: { fileId: string } }>(
      b,
      "file-created"
    );
    a.emit("create-file", { workspaceId: "demo", fileName: "delete-me.ts" });
    const created = await createdEvent;

    const deletedEvent = waitForEvent<{
      fileId: string;
      fallbackFileId: string;
    }>(b, "file-deleted");
    a.emit("delete-file", {
      workspaceId: "demo",
      fileId: created.file.fileId
    });
    expect(await deletedEvent).toMatchObject({
      fileId: created.file.fileId,
      fallbackFileId: "main.ts"
    });
    expect(
      workspaces
        .getWorkspaceState("demo")
        .files.some((file) => file.fileId === created.file.fileId)
    ).toBe(false);

    const staleCodeChangeError = waitForEvent<{ code: string }>(
      a,
      "file-operation-error"
    );
    a.emit("code-change", {
      workspaceId: "demo",
      fileId: created.file.fileId,
      code: "stale"
    });
    expect(await staleCodeChangeError).toMatchObject({ code: "FILE_NOT_FOUND" });
    expect(
      workspaces
        .getWorkspaceState("demo")
        .files.some((file) => file.fileId === created.file.fileId)
    ).toBe(false);

    const finalFileError = waitForEvent<{ code: string }>(
      a,
      "file-operation-error"
    );
    a.emit("delete-file", {
      workspaceId: "demo",
      fileId: "main.ts"
    });
    expect(await finalFileError).toMatchObject({
      code: "CANNOT_DELETE_LAST_FILE"
    });
  });

  it("syncs collaborators, file selection, cursor updates, and disconnects", async () => {
    const a = client();
    const b = client();
    await Promise.all([waitForEvent(a, "connect"), waitForEvent(b, "connect")]);
    const twoCollaborators = waitForEventWhere<{
      collaborators: { userId: string }[];
    }>(
      b,
      "collaborators-state",
      (state) => state.collaborators.length === 2
    );
    a.emit("join-workspace", { workspaceId: "demo" });
    b.emit("join-workspace", { workspaceId: "demo" });
    await Promise.all([
      waitForEvent(a, "workspace-state"),
      waitForEvent(b, "workspace-state")
    ]);

    const state = await twoCollaborators;
    expect(state.collaborators).toHaveLength(2);

    const selectedState = waitForEventWhere<{
      collaborators: { userId: string; currentFileId: string }[];
    }>(
      b,
      "collaborators-state",
      (payload) =>
        payload.collaborators.some(
          (collaborator) =>
            collaborator.userId === a.id &&
            collaborator.currentFileId === "main.ts"
        )
    );
    a.emit("file-selected", { workspaceId: "demo", fileId: "main.ts" });
    expect((await selectedState).collaborators).toContainEqual(
      expect.objectContaining({ userId: a.id, currentFileId: "main.ts" })
    );

    const cursorState = waitForEventWhere<{
      collaborators: {
        userId: string;
        currentFileId: string;
        cursorPosition: { lineNumber: number; column: number };
      }[];
    }>(
      b,
      "collaborators-state",
      (payload) =>
        payload.collaborators.some(
          (collaborator) =>
            collaborator.userId === a.id &&
            collaborator.currentFileId === "main.ts" &&
            collaborator.cursorPosition?.lineNumber === 2 &&
            collaborator.cursorPosition?.column === 4
        )
    );
    a.emit("cursor-change", {
      workspaceId: "demo",
      fileId: "main.ts",
      cursorPosition: { lineNumber: 2, column: 4 }
    });
    expect((await cursorState).collaborators).toContainEqual(
      expect.objectContaining({
        userId: a.id,
        currentFileId: "main.ts",
        cursorPosition: { lineNumber: 2, column: 4 }
      })
    );

    const disconnectState = waitForEventWhere<{
      collaborators: { userId: string }[];
    }>(
      b,
      "collaborators-state",
      (payload) =>
        payload.collaborators.length === 1 &&
        !payload.collaborators.some((collaborator) => collaborator.userId === a.id)
    );
    a.disconnect();
    expect((await disconnectState).collaborators).not.toContainEqual(
      expect.objectContaining({ userId: a.id })
    );
  });

  it("removes collaborator presence on explicit leave without deleting files", async () => {
    const a = client();
    const b = client();
    await Promise.all([waitForEvent(a, "connect"), waitForEvent(b, "connect")]);
    a.emit("join-workspace", { workspaceId: "demo" });
    b.emit("join-workspace", { workspaceId: "demo" });
    await Promise.all([
      waitForEvent(a, "workspace-state"),
      waitForEvent(b, "workspace-state")
    ]);

    a.emit("cursor-change", {
      workspaceId: "demo",
      fileId: "main.ts",
      cursorPosition: { lineNumber: 4, column: 2 }
    });
    await waitForEventWhere<{ collaborators: { userId: string }[] }>(
      b,
      "collaborators-state",
      (payload) =>
        payload.collaborators.some((collaborator) => collaborator.userId === a.id)
    );

    const leaveState = waitForEventWhere<{
      collaborators: { userId: string; cursorPosition: unknown }[];
    }>(
      b,
      "collaborators-state",
      (payload) =>
        payload.collaborators.length === 1 &&
        !payload.collaborators.some((collaborator) => collaborator.userId === a.id)
    );
    a.emit("leave-workspace");

    expect((await leaveState).collaborators).not.toContainEqual(
      expect.objectContaining({ userId: a.id })
    );
    expect(workspaces.getWorkspaceState("demo").files).toHaveLength(1);
    expect(workspaces.getWorkspaceState("demo").files[0]?.fileId).toBe("main.ts");
  });

  it("does not recreate a missing persisted workspace unless creation is explicit", async () => {
    const localHttpServer = createServer(createApp());
    const localIoServer = new Server(localHttpServer);
    registerSocketHandlers(localIoServer, {
      persistence: {
        loadWorkspace: async () => null
      }
    });
    await new Promise<void>((resolve) => localHttpServer.listen(0, resolve));
    const address = localHttpServer.address() as AddressInfo;
    const localSocket = createClient(`http://localhost:${address.port}`, {
      forceNew: true,
      reconnection: false
    });

    await waitForEvent(localSocket, "connect");
    localSocket.emit("join-workspace", { workspaceId: "missing-room" });

    expect(await waitForEvent<{ code: string; message: string }>(
      localSocket,
      "workspace-error"
    )).toMatchObject({
      code: "WORKSPACE_NOT_FOUND",
      message: "Workspace not found or expired."
    });
    localSocket.disconnect();
    await new Promise<void>((resolve) => localIoServer.close(() => resolve()));
    await new Promise<void>((resolve) => localHttpServer.close(() => resolve()));
  });

  it("creates a missing workspace only when createIfMissing is true", async () => {
    const localHttpServer = createServer(createApp());
    const localIoServer = new Server(localHttpServer);
    registerSocketHandlers(localIoServer, {
      persistence: {
        createWorkspace: async () => undefined,
        loadWorkspace: async () => null
      }
    });
    await new Promise<void>((resolve) => localHttpServer.listen(0, resolve));
    const address = localHttpServer.address() as AddressInfo;
    const localSocket = createClient(`http://localhost:${address.port}`, {
      forceNew: true,
      reconnection: false
    });

    await waitForEvent(localSocket, "connect");
    localSocket.emit("join-workspace", {
      workspaceId: "new-room",
      createIfMissing: true
    });

    expect(await waitForEvent<{ workspaceId: string; files: unknown[] }>(
      localSocket,
      "workspace-state"
    )).toMatchObject({
      workspaceId: "new-room",
      files: expect.any(Array)
    });
    localSocket.disconnect();
    await new Promise<void>((resolve) => localIoServer.close(() => resolve()));
    await new Promise<void>((resolve) => localHttpServer.close(() => resolve()));
  });
});
