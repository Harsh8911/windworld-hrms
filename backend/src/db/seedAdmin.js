const bcrypt = require("bcryptjs");

const { pool } = require("./pool");

async function seedAdmin() {
  const email = process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase();
  const username = process.env.ADMIN_SEED_USERNAME?.trim().toLowerCase();
  const fullName = process.env.ADMIN_SEED_FULL_NAME?.trim();
  const password = process.env.ADMIN_SEED_PASSWORD;

  if (!email || !username || !fullName || !password) {
    throw new Error("All ADMIN_SEED_* environment variables are required");
  }

  if (password.length < 8) {
    throw new Error("ADMIN_SEED_PASSWORD must contain at least 8 characters");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    `INSERT INTO users (email, username, full_name, password_hash, role)
     VALUES ($1, $2, $3, $4, 'ADMIN')
     ON CONFLICT (email) DO UPDATE SET
       username = EXCLUDED.username,
       full_name = EXCLUDED.full_name,
       password_hash = EXCLUDED.password_hash,
       role = 'ADMIN',
       is_active = TRUE,
       updated_at = NOW()
     RETURNING id`,
    [email, username, fullName, passwordHash],
  );

  console.log(
    result.rowCount === 1
      ? `Administrator credentials synchronized: ${email}`
      : `Unable to synchronize administrator account: ${email}`,
  );
}

seedAdmin()
  .catch((error) => {
    console.error("Administrator seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
