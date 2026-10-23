const path = require("node:path");

require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

function required(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function positiveInteger(name, fallback) {
  const rawValue = process.env[name] ?? String(fallback);
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function boolean(name, fallback = false) {
  const rawValue = process.env[name];

  if (rawValue === undefined) {
    return fallback;
  }

  if (rawValue === "true") return true;
  if (rawValue === "false") return false;

  throw new Error(`${name} must be either true or false`);
}

const accessSecret = required("JWT_ACCESS_SECRET");
const refreshSecret = required("JWT_REFRESH_SECRET");

if (accessSecret.length < 32 || refreshSecret.length < 32) {
  throw new Error("JWT secrets must each contain at least 32 characters");
}

if (accessSecret === refreshSecret) {
  throw new Error("JWT access and refresh secrets must be different");
}

const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: positiveInteger("PORT", 5005),
  corsOrigins: (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  database: Object.freeze({
    host: process.env.DB_HOST ?? "localhost",
    port: positiveInteger("DB_PORT", 5432),
    name: process.env.DB_NAME ?? "windworld",
    user: process.env.DB_USER ?? "postgres",
    password: required("DB_PASSWORD"),
    ssl: boolean("DB_SSL"),
    poolMax: positiveInteger("DB_POOL_MAX", 10),
  }),
  jwt: Object.freeze({
    accessSecret,
    refreshSecret,
    accessTtlMinutes: positiveInteger("JWT_ACCESS_TTL_MINUTES", 15),
    refreshTtlDays: positiveInteger("JWT_REFRESH_TTL_DAYS", 7),
    issuer: process.env.JWT_ISSUER ?? "windworld-api",
    audience: process.env.JWT_AUDIENCE ?? "windworld-mobile",
  }),
});

module.exports = { env };
