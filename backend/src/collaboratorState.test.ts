import { describe, expect, it } from "vitest";
import {
  CollaboratorStateStore,
  generateAnonymousName
} from "./collaboratorState.js";

describe("CollaboratorStateStore", () => {
  it("adds collaborators with display names and colors", () => {
    const names = ["User4837", "User1294"];
    const store = new CollaboratorStateStore({
      colors: ["red", "blue"],
      generateAnonymousName: () => names.shift() ?? "User9021"
    });

    expect(store.addCollaborator("demo", "socket-1", "main.ts")).toMatchObject({
      userId: "socket-1",
      displayName: "User4837",
      color: "red",
      currentFileId: "main.ts",
      cursorPosition: null
    });
    expect(store.addCollaborator("demo", "socket-2", "utils.ts")).toMatchObject({
      userId: "socket-2",
      displayName: "User1294",
      color: "blue"
    });
    expect(store.getCollaborators("demo")).toHaveLength(2);
  });

  it("generates anonymous names with a User prefix and four digit number", () => {
    const name = generateAnonymousName();

    expect(name).toMatch(/^User[1-9][0-9]{3}$/);
    expect(Number(name.replace("User", ""))).toBeGreaterThanOrEqual(1000);
    expect(Number(name.replace("User", ""))).toBeLessThanOrEqual(9999);
  });

  it("avoids duplicate active names when practical", () => {
    const activeNames = new Set(["User1000", "User1001"]);
    const originalRandom = Math.random;
    const randomValues = [0, 0.00012, 0.5];

    Math.random = () => randomValues.shift() ?? 0.5;

    try {
      expect(generateAnonymousName(activeNames)).not.toBe("User1000");
      expect(generateAnonymousName(activeNames)).not.toBe("User1001");
    } finally {
      Math.random = originalRandom;
    }
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
