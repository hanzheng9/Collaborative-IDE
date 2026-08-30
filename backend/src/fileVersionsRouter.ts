import { Router } from "express";
import type {
  PersistedFileVersion,
  PersistedFileVersionContent
} from "./database.js";
import { logger } from "./logger.js";
import type { WorkspaceService } from "./services/workspaceService.js";
import type { CodeChangePayload } from "./types.js";
import { isNonEmptyString, isValidWorkspaceId } from "./validation/socketValidation.js";

type FileVersionsRouterOptions = {
  broadcastCodeChange: (payload: CodeChangePayload) => void;
  deleteFileVersion: (
    workspaceId: string,
    fileId: string,
    versionId: string
  ) => Promise<boolean>;
  getFileVersion: (
    workspaceId: string,
    fileId: string,
    versionId: string
  ) => Promise<PersistedFileVersionContent | null>;
  getFileVersions: (
    workspaceId: string,
    fileId: string
  ) => Promise<PersistedFileVersion[]>;
  workspaceService: WorkspaceService;
};

function isValidVersionId(value: unknown) {
  return typeof value === "string" && /^\d+$/.test(value);
}

function validateParams(params: {
  workspaceId?: string;
  fileId?: string;
  versionId?: string;
}) {
  if (!isValidWorkspaceId(params.workspaceId)) {
    return "Invalid workspace ID.";
  }

  if (!isNonEmptyString(params.fileId)) {
    return "Invalid file ID.";
  }

  if (params.versionId !== undefined && !isValidVersionId(params.versionId)) {
    return "Invalid version ID.";
  }

  return null;
}

function normalizeVersionName(value: unknown) {
  if (value === undefined || value === null) {
    return { ok: true as const, name: null };
  }

  if (typeof value !== "string") {
    return {
      ok: false as const,
      error: "Version name must be text."
    };
  }

  const name = value.trim();

  if (!name) {
    return { ok: true as const, name: null };
  }

  if (name.length > 100) {
    return {
      ok: false as const,
      error: "Version names must be 100 characters or less."
    };
  }

  return { ok: true as const, name };
}

export function createFileVersionsRouter(options: FileVersionsRouterOptions) {
  const router = Router();

  router.post("/:workspaceId/files/:fileId/versions", async (request, response) => {
    const validationError = validateParams(request.params);

    if (validationError) {
      response.status(400).json({ error: validationError });
      return;
    }

    const nameValidation = normalizeVersionName(request.body?.name);

    if (!nameValidation.ok) {
      response.status(400).json({ error: nameValidation.error });
      return;
    }

    const { workspaceId, fileId } = request.params as {
      workspaceId: string;
      fileId: string;
    };
    const workspaceResult = await options.workspaceService.loadWorkspace(workspaceId);

    if (!workspaceResult.ok || !options.workspaceService.hasFile(workspaceId, fileId)) {
      response.status(404).json({ error: "File not found." });
      return;
    }

    const result = await options.workspaceService.createFileVersion(
      workspaceId,
      fileId,
      nameValidation.name
    );

    if (!result.ok) {
      response.status(503).json({ error: result.error });
      return;
    }

    response.status(201).json({ version: result.version });
  });

  router.get("/:workspaceId/files/:fileId/versions", async (request, response) => {
    const validationError = validateParams(request.params);

    if (validationError) {
      response.status(400).json({ error: validationError });
      return;
    }

    const { workspaceId, fileId } = request.params as {
      workspaceId: string;
      fileId: string;
    };
    const workspaceResult = await options.workspaceService.loadWorkspace(workspaceId);

    if (!workspaceResult.ok || !options.workspaceService.hasFile(workspaceId, fileId)) {
      response.status(404).json({ error: "File not found." });
      return;
    }

    try {
      response.json({
        versions: await options.getFileVersions(workspaceId, fileId)
      });
    } catch (error) {
      logger.error("failed to load file versions", { fileId, workspaceId });
      response.status(503).json({
        error: "Version history is temporarily unavailable."
      });
    }
  });

  router.get(
    "/:workspaceId/files/:fileId/versions/:versionId",
    async (request, response) => {
      const validationError = validateParams(request.params);

      if (validationError) {
        response.status(400).json({ error: validationError });
        return;
      }

      const { workspaceId, fileId, versionId } = request.params as {
        workspaceId: string;
        fileId: string;
        versionId: string;
      };
      const workspaceResult = await options.workspaceService.loadWorkspace(workspaceId);

      if (
        !workspaceResult.ok ||
        !options.workspaceService.hasFile(workspaceId, fileId)
      ) {
        response.status(404).json({ error: "File not found." });
        return;
      }

      try {
        const version = await options.getFileVersion(workspaceId, fileId, versionId);

        if (!version) {
          response.status(404).json({ error: "Version not found." });
          return;
        }

        response.json(version);
      } catch (error) {
        logger.error("failed to load file version", {
          fileId,
          versionId,
          workspaceId
        });
        response.status(503).json({
          error: "Version history is temporarily unavailable."
        });
      }
    }
  );

  router.delete(
    "/:workspaceId/files/:fileId/versions/:versionId",
    async (request, response) => {
      const validationError = validateParams(request.params);

      if (validationError) {
        response.status(400).json({ error: validationError });
        return;
      }

      const { workspaceId, fileId, versionId } = request.params as {
        workspaceId: string;
        fileId: string;
        versionId: string;
      };
      const workspaceResult = await options.workspaceService.loadWorkspace(workspaceId);

      if (
        !workspaceResult.ok ||
        !options.workspaceService.hasFile(workspaceId, fileId)
      ) {
        response.status(404).json({ error: "File not found." });
        return;
      }

      try {
        const deleted = await options.deleteFileVersion(
          workspaceId,
          fileId,
          versionId
        );

        if (!deleted) {
          response.status(404).json({ error: "Version not found." });
          return;
        }

        logger.info("file version deleted", {
          fileId,
          versionId,
          workspaceId
        });
        response.status(204).send();
      } catch (error) {
        logger.error("failed to delete file version", {
          fileId,
          versionId,
          workspaceId
        });
        response.status(503).json({
          error: "Version history is temporarily unavailable."
        });
      }
    }
  );

  router.post(
    "/:workspaceId/files/:fileId/versions/:versionId/restore",
    async (request, response) => {
      const validationError = validateParams(request.params);

      if (validationError) {
        response.status(400).json({ error: validationError });
        return;
      }

      const { workspaceId, fileId, versionId } = request.params as {
        workspaceId: string;
        fileId: string;
        versionId: string;
      };
      const workspaceResult = await options.workspaceService.loadWorkspace(workspaceId);

      if (
        !workspaceResult.ok ||
        !options.workspaceService.hasFile(workspaceId, fileId)
      ) {
        response.status(404).json({ error: "File not found." });
        return;
      }

      try {
        const version = await options.getFileVersion(workspaceId, fileId, versionId);

        if (!version) {
          response.status(404).json({ error: "Version not found." });
          return;
        }

        const result = await options.workspaceService.restoreFileContent({
          workspaceId,
          fileId,
          code: version.content
        });

        if (!result.ok) {
          response.status(404).json({ error: result.error });
          return;
        }

        const payload = {
          workspaceId,
          fileId,
          code: result.file.content
        };
        options.broadcastCodeChange(payload);

        logger.info("file version restored", {
          fileId,
          versionId,
          workspaceId
        });
        response.json({
          file: result.file,
          version: {
            id: version.id,
            createdAt: version.createdAt,
            fileId: version.fileId
          }
        });
      } catch (error) {
        logger.error("failed to restore file version", {
          fileId,
          versionId,
          workspaceId
        });
        response.status(503).json({
          error: "Version restore is temporarily unavailable."
        });
      }
    }
  );

  return router;
}
