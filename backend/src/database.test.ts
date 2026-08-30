import { describe, expect, it, vi } from "vitest";
import { createFileVersion } from "./database.js";
import type { Pool as PgPool } from "pg";

describe("file version persistence helpers", () => {
  it("allows explicit manual snapshots with matching content", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: "1",
            file_id: "main.ts",
            name: "Before demo",
            created_at: new Date("2026-08-30T12:00:00.000Z")
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] });

    const version = await createFileVersion(
      "demo",
      "main.ts",
      "const same = true;",
      "Before demo",
      { query } as unknown as PgPool
    );

    expect(version).toEqual({
      id: "1",
      fileId: "main.ts",
      name: "Before demo",
      createdAt: "2026-08-30T12:00:00.000Z"
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain("INSERT INTO file_versions");
  });

  it("prunes old snapshots after a manual version is created", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: "2",
            file_id: "main.ts",
            name: null,
            created_at: new Date("2026-08-30T13:00:00.000Z")
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] });

    await createFileVersion(
      "demo",
      "main.ts",
      "const next = true;",
      null,
      { query } as unknown as PgPool
    );

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain("LIMIT 50");
  });
});
