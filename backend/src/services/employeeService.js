const bcrypt = require("bcryptjs");

const { pool } = require("../db/pool");
const { AppError } = require("../errors/AppError");

function publicEmployee(row) {
  return {
    id: row.user_id,
    employeeId: row.employee_id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    designation: row.designation,
    department: row.department,
    status: row.employment_status,
    isActive: row.is_active,
    attendanceLocation: row.attendance_location_id
      ? { id: row.attendance_location_id, name: row.attendance_location_name }
      : null,
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
  let attendanceLocationName = null;

  try {
    await client.query("BEGIN");

    if (input.attendanceLocationId) {
      const location = await client.query(
        "SELECT id, name FROM attendance_locations WHERE id = $1 AND is_active = TRUE",
        [input.attendanceLocationId],
      );

      if (location.rowCount === 0) {
        throw new AppError(400, "INVALID_ATTENDANCE_LOCATION", "The attendance location is unavailable");
      }

      attendanceLocationName = location.rows[0].name;
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
         attendance_location_id, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING user_id, employee_id, phone, designation, department,
         attendance_location_id, employment_status, created_at, updated_at`,
      [
        userId,
        input.employeeId,
        input.phone ?? null,
        input.designation ?? null,
        input.department ?? null,
        input.attendanceLocationId ?? null,
        adminUserId,
      ],
    );

    await advanceEmployeeIdCounter(client, input.employeeId);

    await client.query("COMMIT");
    return publicEmployee({
      ...result.rows[0],
      email: input.email,
      full_name: input.fullName,
      is_active: true,
      attendance_location_name: attendanceLocationName,
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
         profiles.employment_status,
         users.is_active,
         profiles.attendance_location_id,
         locations.name AS attendance_location_name,
         profiles.created_at,
         profiles.updated_at
       FROM employee_profiles AS profiles
       JOIN users ON users.id = profiles.user_id
       LEFT JOIN attendance_locations AS locations ON locations.id = profiles.attendance_location_id
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

module.exports = { createEmployee, getNextEmployeeId, listEmployees };
