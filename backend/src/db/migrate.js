const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const { pool } = require("./pool");

const migrationsDirectory = path.resolve(__dirname, "../migrations");

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

    const fileNames = (await fs.readdir(migrationsDirectory))
      .filter((fileName) => fileName.endsWith(".sql"))
      .sort();

    for (const fileName of fileNames) {
      const sql = await fs.readFile(path.join(migrationsDirectory, fileName), "utf8");
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
