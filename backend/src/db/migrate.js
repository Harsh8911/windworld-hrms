const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const { pool } = require("./pool");

const migrationDirectories = [
  path.resolve(__dirname, "../migrations"),
  path.resolve(__dirname, "../../db/migrations"),
];

const legacyMigrationIds = [
  "001_create_auth_schema.sql",
  "002_create_employee_and_location_schema.sql",
  "003_create_employee_id_sequence.sql",
  "004_create_employee_id_counter.sql",
  "005_keep_employee_id_in_sync.sql",
  "006_create_attendance_schema.sql",
];

async function baselineExistingLegacySchema(client, migrations) {
  const tracked = await client.query(
    "SELECT id FROM schema_migrations WHERE id = ANY($1::text[])",
    [legacyMigrationIds],
  );
  const trackedIds = new Set(tracked.rows.map((row) => row.id));
  if (legacyMigrationIds.every((migrationId) => trackedIds.has(migrationId))) return;
  // A partially tracked installation should continue from its next migration.
  // Baselining is only for pre-ledger databases whose legacy schema already exists.
  if (trackedIds.size > 0) return;

  const usersTable = await client.query("SELECT to_regclass('public.users') AS relation");
  if (!usersTable.rows[0].relation) return;

  const requiredRelations = [
    "users",
    "refresh_sessions",
    "attendance_locations",
    "employee_profiles",
    "employee_id_counter",
    "work_shifts",
    "attendance_sessions",
  ];
  const relationResult = await client.query(
    `SELECT required.name
     FROM unnest($1::text[]) AS required(name)
     WHERE to_regclass('public.' || required.name) IS NULL`,
    [requiredRelations],
  );
  const missingRelations = new Set(relationResult.rows.map((row) => row.name));
  const missingArtifacts = relationResult.rows.map((row) => `table:${row.name}`);

  const sequenceResult = await client.query(
    "SELECT to_regclass('public.employee_id_sequence') AS relation",
  );
  if (!sequenceResult.rows[0].relation) missingArtifacts.push("sequence:employee_id_sequence");

  const requiredColumns = [
    ["employee_profiles", "shift_id"],
    ["attendance_sessions", "punch_in_latitude"],
    ["attendance_sessions", "punch_out_reason"],
  ];
  for (const [tableName, columnName] of requiredColumns) {
    const result = await client.query(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
       ) AS present`,
      [tableName, columnName],
    );
    if (!result.rows[0].present) missingArtifacts.push(`column:${tableName}.${columnName}`);
  }

  const requiredTriggers = [
    "employee_profiles_sync_employee_id",
    "users_sync_employee_username",
  ];
  const triggerResult = await client.query(
    `SELECT required.name
     FROM unnest($1::text[]) AS required(name)
     WHERE NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgname = required.name AND NOT tgisinternal
     )`,
    [requiredTriggers],
  );
  missingArtifacts.push(...triggerResult.rows.map((row) => `trigger:${row.name}`));

  if (!missingRelations.has("employee_id_counter")) {
    const counterResult = await client.query(
      "SELECT EXISTS (SELECT 1 FROM employee_id_counter WHERE id = 1) AS present",
    );
    if (!counterResult.rows[0].present) missingArtifacts.push("row:employee_id_counter:1");
  }
  if (!missingRelations.has("work_shifts")) {
    const shiftResult = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM work_shifts
         WHERE id = '00000000-0000-0000-0000-000000000001'
       ) AS present`,
    );
    if (!shiftResult.rows[0].present) missingArtifacts.push("row:work_shifts:general");
  }

  if (missingArtifacts.length > 0) {
    throw new Error(
      `Existing database cannot be safely baselined; missing ${missingArtifacts.join(", ")}`,
    );
  }

  const legacyMigrations = migrations.filter((migration) =>
    legacyMigrationIds.includes(migration.fileName),
  );
  if (legacyMigrations.length !== legacyMigrationIds.length) {
    throw new Error("Legacy migration files are incomplete; cannot baseline existing database");
  }

  await client.query("BEGIN");
  try {
    for (const migration of legacyMigrations) {
      if (trackedIds.has(migration.fileName)) continue;
      await client.query(
        "INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)",
        [migration.fileName, migration.checksum],
      );
      console.log(`Baselined existing migration: ${migration.fileName}`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

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

    const migrations = await Promise.all(
      migrationFiles.map(async ({ directory, fileName }) => {
        const sql = await fs.readFile(path.join(directory, fileName), "utf8");
        return {
          directory,
          fileName,
          sql,
          checksum: crypto.createHash("sha256").update(sql).digest("hex"),
        };
      }),
    );

    await baselineExistingLegacySchema(client, migrations);

    for (const { fileName, sql, checksum } of migrations) {
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
