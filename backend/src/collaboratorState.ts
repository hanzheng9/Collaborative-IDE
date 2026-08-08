import type { Collaborator, CursorPosition } from "./types.js";

type CollaboratorStateStoreOptions = {
  colors?: string[];
  generateAnonymousName?: (activeNames: Set<string>) => string;
};

const defaultColors = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899"
];

export class CollaboratorStateStore {
  private readonly collaborators = new Map<string, Map<string, Collaborator>>();
  private readonly socketWorkspaces = new Map<string, string>();
  private readonly colors: string[];
  private readonly generateName: (activeNames: Set<string>) => string;
  private userCount = 0;

  constructor(options: CollaboratorStateStoreOptions = {}) {
    this.colors = options.colors ?? defaultColors;
    this.generateName = options.generateAnonymousName ?? generateAnonymousName;
  }

  addCollaborator(workspaceId: string, userId: string, currentFileId: string) {
    this.removeCollaborator(userId);

    let workspaceCollaborators = this.collaborators.get(workspaceId);

    if (!workspaceCollaborators) {
      workspaceCollaborators = new Map<string, Collaborator>();
      this.collaborators.set(workspaceId, workspaceCollaborators);
    }

    this.userCount += 1;
    const activeNames = new Set(
      Array.from(workspaceCollaborators.values()).map(
        (collaborator) => collaborator.displayName
      )
    );
    const collaborator: Collaborator = {
      userId,
      displayName: this.generateName(activeNames),
      color: this.colors[(this.userCount - 1) % this.colors.length],
      currentFileId,
      cursorPosition: null
    };

    workspaceCollaborators.set(userId, collaborator);
    this.socketWorkspaces.set(userId, workspaceId);

    return collaborator;
  }

  getCollaborators(workspaceId: string) {
    return Array.from(this.collaborators.get(workspaceId)?.values() ?? []);
  }

  getWorkspaceForUser(userId: string) {
    return this.socketWorkspaces.get(userId) ?? null;
  }

  updateCurrentFile(workspaceId: string, userId: string, fileId: string) {
    const collaborator = this.collaborators.get(workspaceId)?.get(userId);

    if (!collaborator) {
      return null;
    }

    collaborator.currentFileId = fileId;
    collaborator.cursorPosition = null;

    return collaborator;
  }

  updateCursor(
    workspaceId: string,
    userId: string,
    fileId: string,
    cursorPosition: CursorPosition
  ) {
    const collaborator = this.collaborators.get(workspaceId)?.get(userId);

    if (!collaborator) {
      return null;
    }

    collaborator.currentFileId = fileId;
    collaborator.cursorPosition = cursorPosition;

    return collaborator;
  }

  removeCollaborator(userId: string) {
    const workspaceId = this.socketWorkspaces.get(userId);

    if (!workspaceId) {
      return null;
    }

    this.collaborators.get(workspaceId)?.delete(userId);
    this.socketWorkspaces.delete(userId);

    return workspaceId;
  }
}

export function generateAnonymousName(activeNames = new Set<string>()) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const name = `User${Math.floor(1000 + Math.random() * 9000)}`;

    if (!activeNames.has(name)) {
      return name;
    }
  }

  for (let number = 1000; number <= 9999; number += 1) {
    const name = `User${number}`;

    if (!activeNames.has(name)) {
      return name;
    }
  }

  return `User${Math.floor(1000 + Math.random() * 9000)}`;
}
