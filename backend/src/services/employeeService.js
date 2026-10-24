const bcrypt = require("bcryptjs");

const { pool } = require("../db/pool");
const { AppError } = require("../errors/AppError");

function publicEmployee(row) {
  const attendanceLocations = row.attendance_locations ?? [];
  return {
    id: row.user_id,
    employeeId: row.employee_id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    designation: row.designation,
    department: row.department,
    employeeRole: row.employee_role,
    status: row.employment_status,
    isActive: row.is_active,
    attendanceLocations,
    attendanceLocation: attendanceLocations[0] ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEmployeeConflict(error) {
  if (error.code !== "23505") return null;

  if (error.constraint === "users_email_key") {
    return new AppError(409, "EMAIL_EXISTS", "A user with this email already exists");
  }

  if (
    error.constraint === "users_username_key" ||
    error.constraint === "employee_profiles_employee_id_key"
  ) {
    return new AppError(409, "EMPLOYEE_ID_EXISTS", "An employee with this employee ID already exists");
  }

  return new AppError(409, "EMPLOYEE_EXISTS", "The employee conflicts with an existing account");
}

function formatEmployeeId(employeeNumber) {
  return `WW-${employeeNumber.toString().padStart(3, "0")}`;
}

async function getNextEmployeeId() {
  const result = await pool.query(
    "SELECT last_value + 1 AS next_value FROM employee_id_counter WHERE id = 1",
  );

  if (result.rowCount !== 1) {
    throw new Error("Employee ID counter is not initialized");
  }

  return formatEmployeeId(result.rows[0].next_value);
}

async function advanceEmployeeIdCounter(client, employeeId) {
  const match = /^WW-(\d+)$/i.exec(employeeId);
  if (!match) return;

  const employeeNumber = BigInt(match[1]);
  if (employeeNumber > 9_223_372_036_854_775_807n) return;

  await client.query(
    `UPDATE employee_id_counter
     SET last_value = GREATEST(last_value, $1::bigint)
     WHERE id = 1`,
    [employeeNumber.toString()],
  );
}

async function createEmployee(input, adminUserId) {
  const client = await pool.connect();
  let attendanceLocations = [];

  try {
    await client.query("BEGIN");

    if (input.attendanceLocationIds.length > 0) {
      const locations = await client.query(
        `SELECT id, name
         FROM attendance_locations
         WHERE id = ANY($1::uuid[]) AND is_active = TRUE
         ORDER BY name`,
        [input.attendanceLocationIds],
      );

      if (locations.rowCount !== input.attendanceLocationIds.length) {
        throw new AppError(
          400,
          "INVALID_ATTENDANCE_LOCATION",
          "One or more attendance locations are unavailable",
        );
      }

      attendanceLocations = locations.rows.map((location) => ({
        id: location.id,
        name: location.name,
      }));
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const userResult = await client.query(
      `INSERT INTO users (email, username, full_name, password_hash, role)
       VALUES ($1, $2, $3, $4, 'EMPLOYEE')
       RETURNING id`,
      [input.email, input.employeeId, input.fullName, passwordHash],
    );
    const userId = userResult.rows[0].id;

    const result = await client.query(
      `INSERT INTO employee_profiles (
         user_id, employee_id, phone, designation, department,
         attendance_location_id, employee_role, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING user_id, employee_id, phone, designation, department,
         employee_role, employment_status, created_at, updated_at`,
      [
        userId,
        input.employeeId,
        input.phone ?? null,
        input.designation ?? null,
        input.department ?? null,
        input.attendanceLocationIds[0] ?? null,
        input.employeeRole,
        adminUserId,
      ],
    );

    if (input.attendanceLocationIds.length > 0) {
      await client.query(
        `INSERT INTO employee_attendance_locations (
           employee_user_id, attendance_location_id, assigned_by
         )
         SELECT $1, location_id, $3
         FROM UNNEST($2::uuid[]) AS assigned(location_id)`,
        [userId, input.attendanceLocationIds, adminUserId],
      );
    }

    await advanceEmployeeIdCounter(client, input.employeeId);

    await client.query("COMMIT");
    return publicEmployee({
      ...result.rows[0],
      email: input.email,
      full_name: input.fullName,
      is_active: true,
      attendance_locations: attendanceLocations,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw mapEmployeeConflict(error) ?? error;
  } finally {
    client.release();
  }
}

async function listEmployees({ search, limit, offset }) {
  const searchPattern = `%${search}%`;
  const filter = `users.role = 'EMPLOYEE'
    AND (
      $1 = '' OR users.full_name ILIKE $2 OR profiles.employee_id ILIKE $2
      OR users.email ILIKE $2 OR COALESCE(profiles.department, '') ILIKE $2
      OR COALESCE(profiles.designation, '') ILIKE $2
    )`;
  const [result, summaryResult] = await Promise.all([
    pool.query(
      `SELECT
         users.id AS user_id,
         profiles.employee_id,
         users.email,
         users.full_name,
         profiles.phone,
         profiles.designation,
         profiles.department,
         profiles.employee_role,
         profiles.employment_status,
         users.is_active,
         COALESCE((
           SELECT JSON_AGG(
             JSON_BUILD_OBJECT('id', locations.id, 'name', locations.name)
             ORDER BY locations.name
           )
           FROM employee_attendance_locations AS assignments
           JOIN attendance_locations AS locations
             ON locations.id = assignments.attendance_location_id
           WHERE assignments.employee_user_id = profiles.user_id
         ), '[]'::json) AS attendance_locations,
         profiles.created_at,
         profiles.updated_at
       FROM employee_profiles AS profiles
       JOIN users ON users.id = profiles.user_id
       WHERE ${filter}
       ORDER BY users.full_name ASC, profiles.employee_id ASC
       LIMIT $3 OFFSET $4`,
      [search, searchPattern, limit, offset],
    ),
    pool.query(
      `SELECT
         COUNT(*)::integer AS total,
         COUNT(*) FILTER (
           WHERE users.is_active = TRUE AND profiles.employment_status = 'ACTIVE'
         )::integer AS active
       FROM employee_profiles AS profiles
       JOIN users ON users.id = profiles.user_id
       WHERE ${filter}`,
      [search, searchPattern],
    ),
  ]);

  return {
    employees: result.rows.map(publicEmployee),
    summary: {
      total: summaryResult.rows[0].total,
      active: summaryResult.rows[0].active,
    },
  };
}

async function getEmployeeById(employeeUserId, queryable = pool) {
  const result = await queryable.query(
    `SELECT
       users.id AS user_id,
       profiles.employee_id,
       users.email,
       users.full_name,
       profiles.phone,
       profiles.designation,
       profiles.department,
       profiles.employee_role,
       profiles.employment_status,
       users.is_active,
       COALESCE((
         SELECT JSON_AGG(
           JSON_BUILD_OBJECT('id', locations.id, 'name', locations.name)
           ORDER BY locations.name
         )
         FROM employee_attendance_locations AS assignments
         JOIN attendance_locations AS locations
           ON locations.id = assignments.attendance_location_id
         WHERE assignments.employee_user_id = profiles.user_id
       ), '[]'::json) AS attendance_locations,
       profiles.created_at,
       profiles.updated_at
     FROM employee_profiles AS profiles
     JOIN users ON users.id = profiles.user_id
     WHERE profiles.user_id = $1 AND users.role = 'EMPLOYEE'`,
    [employeeUserId],
  );

  if (result.rowCount === 0) {
    throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Employee profile not found");
  }

  return publicEmployee(result.rows[0]);
}

async function updateEmployee(employeeUserId, input, adminUserId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const target = await client.query(
      `SELECT profiles.user_id
       FROM employee_profiles AS profiles
       JOIN users ON users.id = profiles.user_id
       WHERE profiles.user_id = $1 AND users.role = 'EMPLOYEE'
       FOR UPDATE OF profiles, users`,
      [employeeUserId],
    );
    if (target.rowCount === 0) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Employee profile not found");
    }

    if (input.attendanceLocationIds.length > 0) {
      const locations = await client.query(
        `SELECT id FROM attendance_locations
         WHERE id = ANY($1::uuid[]) AND is_active = TRUE`,
        [input.attendanceLocationIds],
      );
      if (locations.rowCount !== input.attendanceLocationIds.length) {
        throw new AppError(
          400,
          "INVALID_ATTENDANCE_LOCATION",
          "One or more attendance locations are unavailable",
        );
      }
    }

    await client.query(
      `UPDATE users
       SET email = $2, full_name = $3, updated_at = NOW()
       WHERE id = $1`,
      [employeeUserId, input.email, input.fullName],
    );
    await client.query(
      `UPDATE employee_profiles
       SET
         phone = $2,
         designation = $3,
         department = $4,
         employee_role = $5,
         attendance_location_id = $6,
         updated_at = NOW()
       WHERE user_id = $1`,
      [
        employeeUserId,
        input.phone ?? null,
        input.designation,
        input.department,
        input.employeeRole,
        input.attendanceLocationIds[0] ?? null,
      ],
    );
    await client.query(
      "DELETE FROM employee_attendance_locations WHERE employee_user_id = $1",
      [employeeUserId],
    );
    if (input.attendanceLocationIds.length > 0) {
      await client.query(
        `INSERT INTO employee_attendance_locations (
           employee_user_id, attendance_location_id, assigned_by
         )
         SELECT $1, location_id, $3
         FROM UNNEST($2::uuid[]) AS assigned(location_id)`,
        [employeeUserId, input.attendanceLocationIds, adminUserId],
      );
    }

    await client.query("COMMIT");
    return getEmployeeById(employeeUserId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw mapEmployeeConflict(error) ?? error;
  } finally {
    client.release();
  }
}

async function setEmployeeArchived(employeeUserId, archived) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE users
       SET is_active = $2, updated_at = NOW()
       WHERE id = $1 AND role = 'EMPLOYEE'
       RETURNING id`,
      [employeeUserId, !archived],
    );
    if (result.rowCount === 0) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Employee profile not found");
    }

    await client.query(
      `UPDATE employee_profiles
       SET employment_status = $2, updated_at = NOW()
       WHERE user_id = $1`,
      [employeeUserId, archived ? "INACTIVE" : "ACTIVE"],
    );
    if (archived) {
      await client.query(
        `UPDATE refresh_sessions
         SET revoked_at = COALESCE(revoked_at, NOW())
         WHERE user_id = $1`,
        [employeeUserId],
      );
    }

    await client.query("COMMIT");
    return getEmployeeById(employeeUserId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deleteEmployee(employeeUserId) {
  const result = await pool.query(
    `DELETE FROM users
     WHERE id = $1 AND role = 'EMPLOYEE'
     RETURNING id`,
    [employeeUserId],
  );
  if (result.rowCount === 0) {
    throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Employee profile not found");
  }
}

async function updateOwnProfile(employeeUserId, input) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE users
       SET full_name = $2, updated_at = NOW()
       WHERE id = $1 AND role = 'EMPLOYEE' AND is_active = TRUE
       RETURNING id`,
      [employeeUserId, input.fullName],
    );
    if (result.rowCount === 0) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Employee profile not found");
    }
    await client.query(
      `UPDATE employee_profiles
       SET phone = $2, updated_at = NOW()
       WHERE user_id = $1`,
      [employeeUserId, input.phone ?? null],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createEmployee,
  deleteEmployee,
  getEmployeeById,
  getNextEmployeeId,
  listEmployees,
  setEmployeeArchived,
  updateEmployee,
  updateOwnProfile,
};
