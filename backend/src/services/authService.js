const crypto = require("node:crypto");

const bcrypt = require("bcryptjs");

const { env } = require("../config/env");
const { pool } = require("../db/pool");
const { AppError } = require("../errors/AppError");
const {
  hashToken,
  refreshExpirationDate,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require("./tokenService");

const INVALID_CREDENTIALS = new AppError(
  401,
  "INVALID_CREDENTIALS",
  "Invalid username, email, or password",
);

// Keeps failed login timing closer to a real password comparison.
const DUMMY_PASSWORD_HASH =
  "$2b$12$9QllBmHG9Gdmf/CAQ6PqI.uZHQn6XTKAX2pRFAyzbIun8.KjsBd8K";

function publicUser(user) {
  const result = {
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
  };

  if (user.role === "EMPLOYEE" && user.employee_id) {
    const attendanceLocations = user.attendance_locations ?? [];
    result.employeeProfile = {
      employeeId: user.employee_id,
      phone: user.phone,
      designation: user.designation,
      department: user.department,
      employeeRole: user.employee_role,
      status: user.employment_status,
      attendanceLocations,
      attendanceLocation: attendanceLocations[0] ?? null,
    };
  }

  return result;
}

async function createSession(client, user) {
  const sessionId = crypto.randomUUID();
  const refreshToken = signRefreshToken(user.id, sessionId);

  await client.query(
    `INSERT INTO refresh_sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [sessionId, user.id, hashToken(refreshToken), refreshExpirationDate()],
  );

  return {
    accessToken: signAccessToken(user),
    refreshToken,
    accessTokenExpiresInSeconds: env.jwt.accessTtlMinutes * 60,
  };
}

async function login(identity, password, requiredRole) {
  const normalizedIdentity = identity.trim().toLowerCase();
  const result = await pool.query(
    `SELECT id, email, username, full_name, password_hash, role, is_active
     FROM users
     WHERE email = $1 OR username = $1
     LIMIT 1`,
    [normalizedIdentity],
  );
  const user = result.rows[0];
  const passwordMatches = await bcrypt.compare(
    password,
    user?.password_hash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordMatches || !user.is_active || (requiredRole && user.role !== requiredRole)) {
    throw INVALID_CREDENTIALS;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tokens = await createSession(client, user);
    await client.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);
    await client.query("COMMIT");
    return { user: publicUser(user), ...tokens };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function loginAdmin(identity, password) {
  return login(identity, password, "ADMIN");
}

async function refreshSession(refreshToken) {
  const payload = verifyRefreshToken(refreshToken);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT
         sessions.id,
         sessions.token_hash,
         sessions.expires_at,
         sessions.revoked_at,
         users.id AS user_id,
         users.email,
         users.username,
         users.full_name,
         users.role,
         users.is_active
       FROM refresh_sessions AS sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = $1 AND sessions.user_id = $2
       FOR UPDATE`,
      [payload.jti, payload.sub],
    );
    const session = result.rows[0];

    if (
      !session ||
      session.revoked_at ||
      !session.is_active ||
      new Date(session.expires_at) <= new Date() ||
      session.token_hash.trim() !== hashToken(refreshToken)
    ) {
      throw new AppError(401, "INVALID_REFRESH_TOKEN", "The refresh token is invalid or expired");
    }

    await client.query("UPDATE refresh_sessions SET revoked_at = NOW() WHERE id = $1", [
      session.id,
    ]);

    const user = {
      id: session.user_id,
      email: session.email,
      username: session.username,
      full_name: session.full_name,
      role: session.role,
    };
    const tokens = await createSession(client, user);

    await client.query("COMMIT");
    return { user: publicUser(user), ...tokens };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function logout(refreshToken) {
  try {
    const payload = verifyRefreshToken(refreshToken);
    await pool.query(
      `UPDATE refresh_sessions
       SET revoked_at = COALESCE(revoked_at, NOW())
       WHERE id = $1 AND user_id = $2 AND token_hash = $3`,
      [payload.jti, payload.sub, hashToken(refreshToken)],
    );
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
  }
}

async function getUserById(userId) {
  const result = await pool.query(
    `SELECT
       users.id,
       users.email,
       users.username,
       users.full_name,
       users.role,
       profiles.employee_id,
       profiles.phone,
       profiles.designation,
       profiles.department,
       profiles.employee_role,
       profiles.employment_status,
       COALESCE((
         SELECT JSON_AGG(
           JSON_BUILD_OBJECT(
             'id', locations.id,
             'name', locations.name,
             'latitude', locations.latitude::float8,
             'longitude', locations.longitude::float8,
             'wifiIp', locations.wifi_ip::text,
             'geofenceRadiusMeters', locations.geofence_radius_meters,
             'isPrimary', locations.is_primary,
             'isActive', locations.is_active
           )
           ORDER BY locations.name
         )
         FROM employee_attendance_locations AS assignments
         JOIN attendance_locations AS locations
           ON locations.id = assignments.attendance_location_id
         WHERE assignments.employee_user_id = profiles.user_id
       ), '[]'::json) AS attendance_locations
     FROM users
     LEFT JOIN employee_profiles AS profiles ON profiles.user_id = users.id
     WHERE users.id = $1 AND users.is_active = TRUE`,
    [userId],
  );

  if (result.rowCount === 0) {
    throw new AppError(401, "ACCOUNT_UNAVAILABLE", "The user account is unavailable");
  }

  return publicUser(result.rows[0]);
}

module.exports = { getUserById, login, loginAdmin, logout, refreshSession };
