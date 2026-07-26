export const workspaceIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/;

export function isValidWorkspaceId(workspaceId: string) {
  return workspaceIdPattern.test(workspaceId);
}

export function createWorkspaceId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }

  return Math.random().toString(36).slice(2, 10);
}

export function getWorkspacePath(workspaceId: string) {
  return `/workspace/${encodeURIComponent(workspaceId)}`;
}

export function parseWorkspaceInput(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  try {
    const url = new URL(trimmedValue);
    const [, route, workspaceId] = url.pathname.split("/");

    if (route === "workspace" && workspaceId) {
      return decodeURIComponent(workspaceId);
    }
  } catch {
    // Treat plain text as a workspace ID.
  }

  return trimmedValue.replace(/^\/workspace\//, "");
}
