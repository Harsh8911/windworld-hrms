import bcrypt from "bcryptjs";

import { pool } from "../src/db/pool.js";

type AdminSeedConfig = {
  email: string;
  username: string;
  fullName: string;
  password: string;
};

const BCRYPT_COST = 12;
const BCRYPT_MAX_PASSWORD_BYTES = 72;

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getAdminSeedConfig(): AdminSeedConfig {
  const password = requiredEnvironmentValue("ADMIN_SEED_PASSWORD");

  if (password.length < 8) {
    throw new Error("ADMIN_SEED_PASSWORD must contain at least 8 characters");
  }

  if (Buffer.byteLength(password, "utf8") > BCRYPT_MAX_PASSWORD_BYTES) {
    throw new Error(
      `ADMIN_SEED_PASSWORD must not exceed ${BCRYPT_MAX_PASSWORD_BYTES} UTF-8 bytes`,
    );
  }

  return {
    email: requiredEnvironmentValue("ADMIN_SEED_EMAIL").toLowerCase(),
    username: requiredEnvironmentValue("ADMIN_SEED_USERNAME").toLowerCase(),
    fullName: requiredEnvironmentValue("ADMIN_SEED_FULL_NAME"),
    password,
  };
}

async function seedAdmin(): Promise<void> {
  const admin = getAdminSeedConfig();
  const passwordHash = await bcrypt.hash(admin.password, BCRYPT_COST);

  const result = await pool.query<{ id: string; email: string }>(
    `INSERT INTO users (
       email,
       username,
       full_name,
       password_hash,
       role,
       is_active
     )
     VALUES ($1, $2, $3, $4, 'ADMIN', TRUE)
     ON CONFLICT (email) DO UPDATE SET
       username = EXCLUDED.username,
       full_name = EXCLUDED.full_name,
       password_hash = EXCLUDED.password_hash,
       role = 'ADMIN',
       is_active = TRUE,
       updated_at = NOW()
     RETURNING id, email`,
    [admin.email, admin.username, admin.fullName, passwordHash],
  );

  const seededAdmin = result.rows[0];

  if (!seededAdmin) {
    throw new Error("PostgreSQL did not return the seeded administrator");
  }

  console.log(`Administrator account seeded: ${seededAdmin.email}`);
}

seedAdmin()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Administrator seed failed:", message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
