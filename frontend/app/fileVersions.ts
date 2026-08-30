import { getBackendUrl } from "./backendUrl";
import type { WorkspaceFile } from "./types";

export type FileVersionSummary = {
  id: string;
  fileId: string;
  name: string | null;
  createdAt: string;
};

export type FileVersionContent = FileVersionSummary & {
  content: string;
};

export type RestoreFileVersionResult = {
  file: WorkspaceFile;
  version: FileVersionSummary;
};

async function parseResponse<T>(response: Response, fallbackMessage: string) {
  const body = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(body.error ?? fallbackMessage);
  }

  return body;
}

function getVersionsPath(
  workspaceId: string,
  fileId: string,
  versionId?: string
) {
  const basePath = `/api/workspaces/${encodeURIComponent(
    workspaceId
  )}/files/${encodeURIComponent(fileId)}/versions`;

  return versionId ? `${basePath}/${encodeURIComponent(versionId)}` : basePath;
}

export async function listFileVersions(workspaceId: string, fileId: string) {
  const response = await fetch(getBackendUrl(getVersionsPath(workspaceId, fileId)), {
    credentials: "omit"
  });
  const body = await parseResponse<{ versions: FileVersionSummary[] }>(
    response,
    "Could not load version history."
  );

  return body.versions;
}

export async function getFileVersion(
  workspaceId: string,
  fileId: string,
  versionId: string
) {
  const response = await fetch(
    getBackendUrl(getVersionsPath(workspaceId, fileId, versionId)),
    { credentials: "omit" }
  );

  return parseResponse<FileVersionContent>(
    response,
    "Could not load this version."
  );
}

export async function saveFileVersion(
  workspaceId: string,
  fileId: string,
  name: string
) {
  const response = await fetch(getBackendUrl(getVersionsPath(workspaceId, fileId)), {
    body: JSON.stringify({ name }),
    credentials: "omit",
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const body = await parseResponse<{ version: FileVersionSummary }>(
    response,
    "Could not save this version."
  );

  return body.version;
}

export async function restoreFileVersion(
  workspaceId: string,
  fileId: string,
  versionId: string
) {
  const response = await fetch(
    getBackendUrl(`${getVersionsPath(workspaceId, fileId, versionId)}/restore`),
    {
      credentials: "omit",
      method: "POST"
    }
  );

  return parseResponse<RestoreFileVersionResult>(
    response,
    "Could not restore this version."
  );
}

export async function deleteFileVersion(
  workspaceId: string,
  fileId: string,
  versionId: string
) {
  const response = await fetch(
    getBackendUrl(getVersionsPath(workspaceId, fileId, versionId)),
    {
      credentials: "omit",
      method: "DELETE"
    }
  );

  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    throw new Error(body.error ?? "Could not delete this version.");
  }
}
