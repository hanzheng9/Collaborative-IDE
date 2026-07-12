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
});
