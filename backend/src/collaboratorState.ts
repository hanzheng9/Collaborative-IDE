import type { Collaborator, CursorPosition } from "./types.js";

type CollaboratorStateStoreOptions = {
  colors?: string[];
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
  private userCount = 0;

  constructor(options: CollaboratorStateStoreOptions = {}) {
    this.colors = options.colors ?? defaultColors;
  }

  addCollaborator(workspaceId: string, userId: string, currentFileId: string) {
    let workspaceCollaborators = this.collaborators.get(workspaceId);

    if (!workspaceCollaborators) {
      workspaceCollaborators = new Map<string, Collaborator>();
      this.collaborators.set(workspaceId, workspaceCollaborators);
    }

    this.userCount += 1;
    const collaborator: Collaborator = {
      userId,
      displayName: `User ${this.userCount}`,
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
