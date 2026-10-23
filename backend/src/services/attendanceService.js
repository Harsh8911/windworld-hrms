const { pool } = require("../db/pool");
const { AppError } = require("../errors/AppError");

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceInMeters(latitudeA, longitudeA, latitudeB, longitudeB) {
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function validateGeofence(context, position) {
  if (!context.attendance_location_id) {
    throw new AppError(
      422,
      "ATTENDANCE_LOCATION_REQUIRED",
      "Ask your administrator to assign an attendance location before punching",
    );
  }

  if (!context.location_is_active) {
    throw new AppError(
      422,
      "ATTENDANCE_LOCATION_UNAVAILABLE",
      "Your assigned attendance location is currently unavailable",
    );
  }

  const distance = distanceInMeters(
    Number(context.location_latitude),
    Number(context.location_longitude),
    position.latitude,
    position.longitude,
  );
  const radius = Number(context.geofence_radius_meters);

  if (distance + position.accuracyMeters > radius) {
    throw new AppError(
      422,
      "OUTSIDE_GEOFENCE",
      `You must be inside the ${radius}-meter ${context.location_name} geofence to punch`,
    );
  }

  return distance;
}

async function getEmployeeContext(client, employeeUserId, { lock = false } = {}) {
  const result = await client.query(
    `SELECT
       profiles.user_id,
       profiles.attendance_location_id,
       shifts.id AS shift_id,
       shifts.name AS shift_name,
       shifts.start_time::text AS shift_start_time,
       shifts.end_time::text AS shift_end_time,
       shifts.max_duration_minutes,
       shifts.timezone,
       locations.name AS location_name,
       locations.latitude AS location_latitude,
       locations.longitude AS location_longitude,
       locations.geofence_radius_meters,
       locations.is_active AS location_is_active,
       CURRENT_TIMESTAMP AS database_now,
       (CURRENT_TIMESTAMP AT TIME ZONE shifts.timezone)::date AS local_date,
       (((CURRENT_TIMESTAMP AT TIME ZONE shifts.timezone)::date + shifts.start_time)
         AT TIME ZONE shifts.timezone) AS shift_start_at,
       (((CURRENT_TIMESTAMP AT TIME ZONE shifts.timezone)::date + shifts.end_time)
         AT TIME ZONE shifts.timezone) AS shift_end_at
     FROM employee_profiles AS profiles
     JOIN work_shifts AS shifts ON shifts.id = profiles.shift_id AND shifts.is_active = TRUE
     LEFT JOIN attendance_locations AS locations ON locations.id = profiles.attendance_location_id
     WHERE profiles.user_id = $1
     ${lock ? "FOR UPDATE OF profiles" : ""}`,
    [employeeUserId],
  );

  if (result.rowCount === 0) {
    throw new AppError(404, "EMPLOYEE_PROFILE_NOT_FOUND", "Employee profile not found");
  }

  return result.rows[0];
}

function publicShift(context) {
  return {
    id: context.shift_id,
    name: context.shift_name,
    startTime: context.shift_start_time.slice(0, 5),
    endTime: context.shift_end_time.slice(0, 5),
    maxDurationMinutes: context.max_duration_minutes,
    timezone: context.timezone,
  };
}

function dateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function publicSession(row) {
  const punchInAt = new Date(row.punch_in_at);
  const punchOutAt = row.punch_out_at ? new Date(row.punch_out_at) : null;
  const durationEnd = punchOutAt ?? new Date(row.database_now ?? Date.now());

  return {
    id: row.id,
    attendanceDate: dateOnly(row.attendance_date),
    punchInAt: punchInAt.toISOString(),
    punchOutAt: punchOutAt?.toISOString() ?? null,
    durationMinutes: Math.max(0, Math.floor((durationEnd - punchInAt) / 60_000)),
    status: punchOutAt ? "COMPLETED" : "IN_PROGRESS",
    isLate: Boolean(row.is_late),
    punchOutReason: row.punch_out_reason,
    location: {
      id: row.attendance_location_id,
      name: row.location_name,
    },
  };
}

async function getSessionById(client, sessionId) {
  const result = await client.query(
    `SELECT
       sessions.*,
       locations.name AS location_name,
       CURRENT_TIMESTAMP AS database_now,
       ((sessions.punch_in_at AT TIME ZONE shifts.timezone)::time > shifts.start_time) AS is_late
     FROM attendance_sessions AS sessions
     JOIN employee_profiles AS profiles ON profiles.user_id = sessions.employee_user_id
     JOIN work_shifts AS shifts ON shifts.id = profiles.shift_id
     JOIN attendance_locations AS locations ON locations.id = sessions.attendance_location_id
     WHERE sessions.id = $1`,
    [sessionId],
  );

  return publicSession(result.rows[0]);
}

async function autoPunchOutExpiredSessions({ employeeUserId } = {}) {
  const parameters = [];
  const employeeFilter = employeeUserId
    ? `AND sessions.employee_user_id = $${parameters.push(employeeUserId)}`
    : "";

  const result = await pool.query(
    `WITH due_sessions AS (
       SELECT
         sessions.id,
         LEAST(
           sessions.punch_in_at + shifts.max_duration_minutes * INTERVAL '1 minute',
           ((sessions.attendance_date + shifts.end_time) AT TIME ZONE shifts.timezone)
         ) AS due_at,
         CASE
           WHEN sessions.punch_in_at + shifts.max_duration_minutes * INTERVAL '1 minute'
             <= ((sessions.attendance_date + shifts.end_time) AT TIME ZONE shifts.timezone)
             THEN 'AUTO_MAX_DURATION'
           ELSE 'AUTO_SHIFT_END'
         END AS reason
       FROM attendance_sessions AS sessions
       JOIN employee_profiles AS profiles ON profiles.user_id = sessions.employee_user_id
       JOIN work_shifts AS shifts ON shifts.id = profiles.shift_id
       WHERE sessions.punch_out_at IS NULL
       ${employeeFilter}
     )
     UPDATE attendance_sessions AS sessions
     SET
       punch_out_at = due_sessions.due_at,
       punch_out_reason = due_sessions.reason,
       updated_at = CURRENT_TIMESTAMP
     FROM due_sessions
     WHERE sessions.id = due_sessions.id
       AND CURRENT_TIMESTAMP >= due_sessions.due_at
     RETURNING sessions.id`,
    parameters,
  );

  return result.rowCount;
}

async function getAttendanceOverview(employeeUserId) {
  await autoPunchOutExpiredSessions({ employeeUserId });

  const client = await pool.connect();
  try {
    const context = await getEmployeeContext(client, employeeUserId);
    const localDate = dateOnly(context.local_date);
    const result = await client.query(
      `SELECT
         sessions.*,
         locations.name AS location_name,
         CURRENT_TIMESTAMP AS database_now,
         ((sessions.punch_in_at AT TIME ZONE shifts.timezone)::time > shifts.start_time) AS is_late
       FROM attendance_sessions AS sessions
       JOIN work_shifts AS shifts ON shifts.id = $2
       JOIN attendance_locations AS locations ON locations.id = sessions.attendance_location_id
       WHERE sessions.employee_user_id = $1
         AND sessions.attendance_date >= ($3::date - 370)
       ORDER BY sessions.attendance_date DESC`,
      [employeeUserId, context.shift_id, localDate],
    );
    const sessions = result.rows.map(publicSession);
    const monthPrefix = localDate.slice(0, 7);
    const monthSessions = sessions.filter((session) => session.attendanceDate.startsWith(monthPrefix));

    return {
      serverTime: new Date(context.database_now).toISOString(),
      attendanceDate: localDate,
      shift: publicShift(context),
      todaySession:
        sessions.find((session) => session.attendanceDate === localDate) ?? null,
      sessions,
      currentMonth: {
        daysPresent: monthSessions.length,
        workedMinutes: monthSessions.reduce(
          (total, session) => total + session.durationMinutes,
          0,
        ),
      },
    };
  } finally {
    client.release();
  }
}

async function punchIn(employeeUserId, position) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const context = await getEmployeeContext(client, employeeUserId, { lock: true });
    const now = new Date(context.database_now);

    if (now < new Date(context.shift_start_at) || now >= new Date(context.shift_end_at)) {
      throw new AppError(
        422,
        "OUTSIDE_SHIFT_HOURS",
        `Punch in is available during ${context.shift_start_time.slice(0, 5)}–${context.shift_end_time.slice(0, 5)}`,
      );
    }

    const existing = await client.query(
      `SELECT punch_out_at
       FROM attendance_sessions
       WHERE employee_user_id = $1 AND attendance_date = $2`,
      [employeeUserId, context.local_date],
    );
    if (existing.rowCount > 0) {
      throw new AppError(
        409,
        existing.rows[0].punch_out_at ? "ATTENDANCE_ALREADY_COMPLETED" : "ALREADY_PUNCHED_IN",
        existing.rows[0].punch_out_at
          ? "Today's attendance session is already completed"
          : "You are already punched in",
      );
    }

    const distance = validateGeofence(context, position);
    const inserted = await client.query(
      `INSERT INTO attendance_sessions (
         employee_user_id,
         attendance_date,
         attendance_location_id,
         punch_in_at,
         punch_in_latitude,
         punch_in_longitude,
         punch_in_accuracy_meters,
         punch_in_distance_meters
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        employeeUserId,
        context.local_date,
        context.attendance_location_id,
        context.database_now,
        position.latitude,
        position.longitude,
        position.accuracyMeters,
        distance,
      ],
    );
    const session = await getSessionById(client, inserted.rows[0].id);
    await client.query("COMMIT");
    return session;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function punchOut(employeeUserId, position) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const context = await getEmployeeContext(client, employeeUserId, { lock: true });
    const active = await client.query(
      `SELECT
         sessions.id,
         sessions.punch_in_at,
         LEAST(
           sessions.punch_in_at + shifts.max_duration_minutes * INTERVAL '1 minute',
           ((sessions.attendance_date + shifts.end_time) AT TIME ZONE shifts.timezone)
         ) AS due_at,
         CASE
           WHEN sessions.punch_in_at + shifts.max_duration_minutes * INTERVAL '1 minute'
             <= ((sessions.attendance_date + shifts.end_time) AT TIME ZONE shifts.timezone)
             THEN 'AUTO_MAX_DURATION'
           ELSE 'AUTO_SHIFT_END'
         END AS automatic_reason
       FROM attendance_sessions AS sessions
       JOIN work_shifts AS shifts ON shifts.id = $2
       WHERE sessions.employee_user_id = $1 AND sessions.punch_out_at IS NULL
       FOR UPDATE OF sessions`,
      [employeeUserId, context.shift_id],
    );

    if (active.rowCount === 0) {
      throw new AppError(409, "NOT_PUNCHED_IN", "There is no active attendance session");
    }

    const currentSession = active.rows[0];
    const now = new Date(context.database_now);
    const dueAt = new Date(currentSession.due_at);

    if (now >= dueAt) {
      await client.query(
        `UPDATE attendance_sessions
         SET punch_out_at = $2, punch_out_reason = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [currentSession.id, currentSession.due_at, currentSession.automatic_reason],
      );
    } else {
      const distance = validateGeofence(context, position);
      await client.query(
        `UPDATE attendance_sessions
         SET
           punch_out_at = $2,
           punch_out_latitude = $3,
           punch_out_longitude = $4,
           punch_out_accuracy_meters = $5,
           punch_out_distance_meters = $6,
           punch_out_reason = 'MANUAL',
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [
          currentSession.id,
          context.database_now,
          position.latitude,
          position.longitude,
          position.accuracyMeters,
          distance,
        ],
      );
    }

    const session = await getSessionById(client, currentSession.id);
    await client.query("COMMIT");
    return session;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  autoPunchOutExpiredSessions,
  getAttendanceOverview,
  punchIn,
  punchOut,
};
