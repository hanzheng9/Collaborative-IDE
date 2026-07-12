import { describe, expect, it } from "vitest";
import { CollaboratorStateStore } from "./collaboratorState.js";

describe("CollaboratorStateStore", () => {
  it("adds collaborators with display names and colors", () => {
    const store = new CollaboratorStateStore({ colors: ["red", "blue"] });

    expect(store.addCollaborator("demo", "socket-1", "main.ts")).toMatchObject({
      userId: "socket-1",
      displayName: "User 1",
      color: "red",
      currentFileId: "main.ts",
      cursorPosition: null
    });
    expect(store.addCollaborator("demo", "socket-2", "utils.ts")).toMatchObject({
      userId: "socket-2",
      displayName: "User 2",
      color: "blue"
    });
    expect(store.getCollaborators("demo")).toHaveLength(2);
  });

  it("updates current file and cursor for only the target collaborator", () => {
    const store = new CollaboratorStateStore({ colors: ["red"] });
    store.addCollaborator("demo", "socket-1", "main.ts");
    store.addCollaborator("demo", "socket-2", "main.ts");

    store.updateCurrentFile("demo", "socket-1", "utils.ts");
    store.updateCursor("demo", "socket-1", "utils.ts", {
      lineNumber: 3,
      column: 8
    });

    const [first, second] = store.getCollaborators("demo");
    expect(first).toMatchObject({
      currentFileId: "utils.ts",
      cursorPosition: { lineNumber: 3, column: 8 }
    });
    expect(second).toMatchObject({
      currentFileId: "main.ts",
      cursorPosition: null
    });
  });

  it("removes collaborators safely", () => {
    const store = new CollaboratorStateStore();
    store.addCollaborator("demo", "socket-1", "main.ts");

    expect(store.removeCollaborator("missing")).toBeNull();
    expect(store.removeCollaborator("socket-1")).toBe("demo");
    expect(store.getCollaborators("demo")).toEqual([]);
  });
});
