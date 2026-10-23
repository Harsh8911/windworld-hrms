const { Pool } = require("pg");

const { env } = require("../config/env");

const pool = new Pool({
  host: env.database.host,
  port: env.database.port,
  database: env.database.name,
  user: env.database.user,
  password: env.database.password,
  max: env.database.poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: env.database.ssl ? { rejectUnauthorized: true } : false,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error", error.message);
});

module.exports = { pool };
