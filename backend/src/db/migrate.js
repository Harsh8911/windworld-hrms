const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const { pool } = require("./pool");

const migrationDirectories = [
  path.resolve(__dirname, "../migrations"),
  path.resolve(__dirname, "../../db/migrations"),
];

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    );
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [
      "windworld_schema_migrations",
    ]);

    const migrationFiles = (
      await Promise.all(
        migrationDirectories.map(async (directory) => {
          try {
            return (await fs.readdir(directory))
              .filter((fileName) => fileName.endsWith(".sql"))
              .map((fileName) => ({ directory, fileName }));
          } catch (error) {
            if (error.code === "ENOENT") return [];
            throw error;
          }
        }),
      )
    )
      .flat()
      .sort((left, right) => left.fileName.localeCompare(right.fileName));

    const duplicateIds = migrationFiles.filter(
      (migration, index) =>
        index > 0 && migration.fileName === migrationFiles[index - 1].fileName,
    );
    if (duplicateIds.length > 0) {
      throw new Error(`Duplicate migration ID: ${duplicateIds[0].fileName}`);
    }

    for (const { directory, fileName } of migrationFiles) {
      const sql = await fs.readFile(path.join(directory, fileName), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      const existing = await client.query(
        "SELECT checksum FROM schema_migrations WHERE id = $1",
        [fileName],
      );

      if (existing.rowCount > 0) {
        if (existing.rows[0].checksum.trim() !== checksum) {
          throw new Error(`Applied migration was modified: ${fileName}`);
        }

        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)",
          [fileName, checksum],
        );
        await client.query("COMMIT");
        console.log(`Applied migration: ${fileName}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
      "windworld_schema_migrations",
    ]).catch(() => undefined);
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exitCode = 1;
});
