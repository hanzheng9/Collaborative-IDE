export type RecentWorkspace = {
  workspaceId: string;
  name: string;
  lastVisitedAt: string;
  lastFileName?: string;
};

const recentWorkspacesStorageKey = "collaborativeIde.recentWorkspaces";
const maxRecentWorkspaces = 10;

function canUseLocalStorage() {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage?.getItem === "function" &&
    typeof window.localStorage?.setItem === "function"
  );
}

function isRecentWorkspace(value: unknown): value is RecentWorkspace {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const item = value as Partial<RecentWorkspace>;

  return (
    typeof item.workspaceId === "string" &&
    item.workspaceId.length > 0 &&
    typeof item.name === "string" &&
    item.name.length > 0 &&
    typeof item.lastVisitedAt === "string" &&
    !Number.isNaN(Date.parse(item.lastVisitedAt)) &&
    (item.lastFileName === undefined || typeof item.lastFileName === "string")
  );
}

function writeRecentWorkspaces(workspaces: RecentWorkspace[]) {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(
      recentWorkspacesStorageKey,
      JSON.stringify(workspaces)
    );
  } catch {
    // Recent history is optional browser-local convenience data.
  }
}

export function getRecentWorkspaces() {
  if (!canUseLocalStorage()) {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(recentWorkspacesStorageKey);

    if (!rawValue) {
      return [];
    }

    const parsedValue: unknown = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .filter(isRecentWorkspace)
      .sort(
        (first, second) =>
          Date.parse(second.lastVisitedAt) - Date.parse(first.lastVisitedAt)
      )
      .slice(0, maxRecentWorkspaces);
  } catch {
    return [];
  }
}

export function addRecentWorkspace(workspace: {
  lastFileName?: string;
  name?: string;
  workspaceId: string;
}) {
  const now = new Date().toISOString();
  const existingWorkspaces = getRecentWorkspaces();
  const previousWorkspace = existingWorkspaces.find(
    (item) => item.workspaceId === workspace.workspaceId
  );
  const nextWorkspace: RecentWorkspace = {
    workspaceId: workspace.workspaceId,
    name: workspace.name?.trim() || previousWorkspace?.name || "Untitled Workspace",
    lastVisitedAt: now,
    lastFileName: workspace.lastFileName ?? previousWorkspace?.lastFileName
  };
  const nextWorkspaces = [
    nextWorkspace,
    ...existingWorkspaces.filter(
      (item) => item.workspaceId !== workspace.workspaceId
    )
  ]
    .sort(
      (first, second) =>
        Date.parse(second.lastVisitedAt) - Date.parse(first.lastVisitedAt)
    )
    .slice(0, maxRecentWorkspaces);

  writeRecentWorkspaces(nextWorkspaces);

  return nextWorkspaces;
}

export function removeRecentWorkspace(workspaceId: string) {
  const nextWorkspaces = getRecentWorkspaces().filter(
    (workspace) => workspace.workspaceId !== workspaceId
  );

  writeRecentWorkspaces(nextWorkspaces);

  return nextWorkspaces;
}

export function clearRecentWorkspaces() {
  writeRecentWorkspaces([]);
  return [];
}

export function formatRecentWorkspaceTime(lastVisitedAt: string) {
  const visitedAt = Date.parse(lastVisitedAt);

  if (Number.isNaN(visitedAt)) {
    return "Visited recently";
  }

  const elapsedMs = Date.now() - visitedAt;
  const elapsedMinutes = Math.max(0, Math.round(elapsedMs / 60000));

  if (elapsedMinutes < 1) {
    return "Visited just now";
  }

  if (elapsedMinutes < 60) {
    return `Visited ${elapsedMinutes} minute${elapsedMinutes === 1 ? "" : "s"} ago`;
  }

  const elapsedHours = Math.round(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return `Visited ${elapsedHours} hour${elapsedHours === 1 ? "" : "s"} ago`;
  }

  const elapsedDays = Math.round(elapsedHours / 24);

  if (elapsedDays === 1) {
    return "Visited yesterday";
  }

  return `Visited ${elapsedDays} days ago`;
}
