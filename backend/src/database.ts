import pg from "pg";
import type { Pool as PgPool, PoolClient } from "pg";
import { logger } from "./logger.js";

export type PersistedFile = {
  fileId: string;
  fileName: string;
  language: string;
  content: string;
};

export type PersistedWorkspace = {
  workspaceId: string;
  files: PersistedFile[];
};

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;

pool?.on("error", (error) => {
  logger.error("database reconnect failure", {
    error: error.message
  });
});

export function isDatabaseConfigured() {
  return Boolean(pool);
}

export async function closeDatabase() {
  await pool?.end();
}

export async function migrateDatabase() {
  if (!pool) {
    logger.warn("database unavailable", {
      reason: "DATABASE_URL is not set"
    });
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      language TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS files_workspace_id_idx ON files(workspace_id);
  `);

  logger.info("PostgreSQL persistence enabled");
}

export async function loadWorkspace(workspaceId: string) {
  if (!pool) {
    return null;
  }

  const workspaceResult = await pool.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE id = $1",
    [workspaceId]
  );

  if (workspaceResult.rowCount === 0) {
    return null;
  }

  const filesResult = await pool.query<{
    id: string;
    name: string;
    language: string;
    content: string;
  }>(
    `
      SELECT id, name, language, content
      FROM files
      WHERE workspace_id = $1
      ORDER BY created_at ASC
    `,
    [workspaceId]
  );

  return {
    workspaceId,
    files: filesResult.rows.map((file) => ({
      fileId: file.id,
      fileName: file.name,
      language: file.language,
      content: file.content
    }))
  } satisfies PersistedWorkspace;
}

export async function createWorkspace(
  workspaceId: string,
  name: string,
  files: PersistedFile[]
) {
  if (!pool) {
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
        INSERT INTO workspaces (id, name)
        VALUES ($1, $2)
        ON CONFLICT (id) DO NOTHING
      `,
      [workspaceId, name]
    );

    for (const file of files) {
      await client.query(
        `
          INSERT INTO files (id, workspace_id, name, language, content)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO NOTHING
        `,
        [file.fileId, workspaceId, file.fileName, file.language, file.content]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function saveFile(
  workspaceId: string,
  file: PersistedFile
) {
  if (!pool) {
    return;
  }

  await pool.query(
    `
      INSERT INTO files (id, workspace_id, name, language, content)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        language = EXCLUDED.language,
        content = EXCLUDED.content,
        updated_at = NOW()
    `,
    [file.fileId, workspaceId, file.fileName, file.language, file.content]
  );

  await touchWorkspace(workspaceId);
}

export async function renameFile(
  workspaceId: string,
  fileId: string,
  fileName: string,
  language: string
) {
  if (!pool) {
    return;
  }

  await pool.query(
    `
      UPDATE files
      SET name = $3, language = $4, updated_at = NOW()
      WHERE workspace_id = $1 AND id = $2
    `,
    [workspaceId, fileId, fileName, language]
  );

  await touchWorkspace(workspaceId);
}

export async function saveFileContent(
  workspaceId: string,
  fileId: string,
  content: string
) {
  if (!pool) {
    return;
  }

  await pool.query(
    `
      UPDATE files
      SET content = $3, updated_at = NOW()
      WHERE workspace_id = $1 AND id = $2
    `,
    [workspaceId, fileId, content]
  );

  await touchWorkspace(workspaceId);
}

export async function deleteFile(workspaceId: string, fileId: string) {
  if (!pool) {
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
        DELETE FROM files
        WHERE workspace_id = $1 AND id = $2
      `,
      [workspaceId, fileId]
    );
    await touchWorkspace(workspaceId, client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function touchWorkspace(
  workspaceId: string,
  client: PgPool | PoolClient | null = pool
) {
  if (!client) {
    return;
  }

  await client.query("UPDATE workspaces SET updated_at = NOW() WHERE id = $1", [
    workspaceId
  ]);
}
