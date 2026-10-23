const { Client } = require("pg");

const { env } = require("../config/env");

async function createDatabase() {
  const databaseName = env.database.name;

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(databaseName)) {
    throw new Error("DB_NAME contains unsupported characters");
  }

  const client = new Client({
    host: env.database.host,
    port: env.database.port,
    database: "postgres",
    user: env.database.user,
    password: env.database.password,
    ssl: env.database.ssl ? { rejectUnauthorized: true } : false,
  });

  await client.connect();

  try {
    const existing = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName],
    );

    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE "${databaseName}"`);
      console.log(`Created PostgreSQL database: ${databaseName}`);
    } else {
      console.log(`PostgreSQL database already exists: ${databaseName}`);
    }
  } finally {
    await client.end();
  }
}

createDatabase().catch((error) => {
  console.error("Database creation failed:", error.message);
  process.exitCode = 1;
});
