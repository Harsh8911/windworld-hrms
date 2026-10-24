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

function publicLocation(location) {
  return {
    id: location.id,
    name: location.name,
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    wifiIp: location.wifi_ip,
    geofenceRadiusMeters: location.geofence_radius_meters,
    isPrimary: location.is_primary,
    isActive: location.is_active,
  };
}

async function getEmployeeContext(client, employeeUserId, { lock = false } = {}) {
  const result = await client.query(
    `SELECT
       profiles.user_id,
       profiles.employee_role,
       shifts.id AS shift_id,
       shifts.name AS shift_name,
       shifts.start_time::text AS shift_start_time,
       shifts.end_time::text AS shift_end_time,
       shifts.max_duration_minutes,
       shifts.timezone,
       CURRENT_TIMESTAMP AS database_now,
       (CURRENT_TIMESTAMP AT TIME ZONE shifts.timezone)::date AS local_date,
       (((CURRENT_TIMESTAMP AT TIME ZONE shifts.timezone)::date + shifts.start_time)
         AT TIME ZONE shifts.timezone) AS shift_start_at,
       (((CURRENT_TIMESTAMP AT TIME ZONE shifts.timezone)::date + shifts.end_time)
         AT TIME ZONE shifts.timezone) AS shift_end_at
     FROM employee_profiles AS profiles
     JOIN work_shifts AS shifts ON shifts.id = profiles.shift_id AND shifts.is_active = TRUE
     WHERE profiles.user_id = $1
     ${lock ? "FOR UPDATE OF profiles" : ""}`,
    [employeeUserId],
  );

  if (result.rowCount === 0) {
    throw new AppError(404, "EMPLOYEE_PROFILE_NOT_FOUND", "Employee profile not found");
  }

  return result.rows[0];
}

async function getAvailableLocations(client, context) {
  const result = await client.query(
    context.employee_role === "MANAGER"
      ? `SELECT * FROM attendance_locations WHERE is_active = TRUE ORDER BY is_primary DESC, name`
      : `SELECT locations.*
         FROM employee_attendance_locations AS assignments
         JOIN attendance_locations AS locations
           ON locations.id = assignments.attendance_location_id
         WHERE assignments.employee_user_id = $1 AND locations.is_active = TRUE
         ORDER BY locations.is_primary DESC, locations.name`,
    context.employee_role === "MANAGER" ? [] : [context.user_id],
  );

  return result.rows;
}

function geofenceDistance(location, position) {
  return distanceInMeters(
    Number(location.latitude),
    Number(location.longitude),
    position.latitude,
    position.longitude,
  );
}

function resolvePunchLocation(
  locations,
  position,
  attendanceLocationId,
  { allowArbitraryLocation = false } = {},
) {
  if (locations.length === 0 && !allowArbitraryLocation) {
    throw new AppError(
      422,
      "ATTENDANCE_LOCATION_REQUIRED",
      "Ask your administrator to assign an active attendance location before punching",
    );
  }

  if (attendanceLocationId) {
    const selected = locations.find((location) => location.id === attendanceLocationId);
    if (!selected) {
      throw new AppError(
        422,
        "ATTENDANCE_LOCATION_NOT_ALLOWED",
        "The selected attendance location is not available to you",
      );
    }

    const distance = geofenceDistance(selected, position);
    if (
      !allowArbitraryLocation &&
      distance + position.accuracyMeters > Number(selected.geofence_radius_meters)
    ) {
      throw new AppError(
        422,
        "OUTSIDE_GEOFENCE",
        `You must be inside the ${selected.geofence_radius_meters}-meter ${selected.name} geofence to punch`,
      );
    }

    return { location: selected, distance };
  }

  const candidates = locations
    .map((location) => ({ location, distance: geofenceDistance(location, position) }))
    .sort((left, right) => left.distance - right.distance);
  const recognized = candidates.find(
    ({ location, distance }) =>
      distance + position.accuracyMeters <= Number(location.geofence_radius_meters),
  );

  if (!recognized && allowArbitraryLocation) {
    return { location: null, distance: null };
  }

  if (!recognized) {
    throw new AppError(
      422,
      "LOCATION_NOT_RECOGNIZED",
      "Sorry, location is not recognized. Please select the location manually from the dropdown.",
    );
  }

  return recognized;
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
    location: row.attendance_location_id
      ? {
          id: row.attendance_location_id,
          name: row.location_name,
        }
      : { id: null, name: "Current GPS location" },
    punchOutLocation:
      row.punch_out_attendance_location_id || row.punch_out_latitude !== null
        ? row.punch_out_attendance_location_id
          ? {
              id: row.punch_out_attendance_location_id,
              name: row.punch_out_location_name,
            }
          : { id: null, name: "Current GPS location" }
        : null,
  };
}

async function getSessionById(client, sessionId) {
  const result = await client.query(
    `SELECT
       sessions.*,
       locations.name AS location_name,
       punch_out_locations.name AS punch_out_location_name,
       CURRENT_TIMESTAMP AS database_now,
       ((sessions.punch_in_at AT TIME ZONE shifts.timezone)::time > shifts.start_time) AS is_late
     FROM attendance_sessions AS sessions
     JOIN employee_profiles AS profiles ON profiles.user_id = sessions.employee_user_id
     JOIN work_shifts AS shifts ON shifts.id = profiles.shift_id
     LEFT JOIN attendance_locations AS locations ON locations.id = sessions.attendance_location_id
     LEFT JOIN attendance_locations AS punch_out_locations
       ON punch_out_locations.id = sessions.punch_out_attendance_location_id
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
    const availableLocations = await getAvailableLocations(client, context);
    const localDate = dateOnly(context.local_date);
    const result = await client.query(
      `SELECT
         sessions.*,
         locations.name AS location_name,
         punch_out_locations.name AS punch_out_location_name,
         CURRENT_TIMESTAMP AS database_now,
         ((sessions.punch_in_at AT TIME ZONE shifts.timezone)::time > shifts.start_time) AS is_late
       FROM attendance_sessions AS sessions
       JOIN work_shifts AS shifts ON shifts.id = $2
       LEFT JOIN attendance_locations AS locations ON locations.id = sessions.attendance_location_id
       LEFT JOIN attendance_locations AS punch_out_locations
         ON punch_out_locations.id = sessions.punch_out_attendance_location_id
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
      employeeRole: context.employee_role,
      availableLocations: availableLocations.map(publicLocation),
      shift: publicShift(context),
      todaySession: sessions.find((session) => session.attendanceDate === localDate) ?? null,
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

async function punchIn(employeeUserId, input) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const context = await getEmployeeContext(client, employeeUserId, { lock: true });
    const now = new Date(context.database_now);

    if (now < new Date(context.shift_start_at) || now >= new Date(context.shift_end_at)) {
      throw new AppError(
        422,
        "OUTSIDE_SHIFT_HOURS",
        `Punch in is available during ${context.shift_start_time.slice(0, 5)}-${context.shift_end_time.slice(0, 5)}`,
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

    const locations = await getAvailableLocations(client, context);
    const resolved = resolvePunchLocation(
      locations,
      input.position,
      input.attendanceLocationId,
      { allowArbitraryLocation: context.employee_role === "MANAGER" },
    );
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
        resolved.location?.id ?? null,
        context.database_now,
        input.position.latitude,
        input.position.longitude,
        input.position.accuracyMeters,
        resolved.distance,
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

async function punchOut(employeeUserId, input) {
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
      const locations = await getAvailableLocations(client, context);
      const resolved = resolvePunchLocation(
        locations,
        input.position,
        input.attendanceLocationId,
        { allowArbitraryLocation: context.employee_role === "MANAGER" },
      );
      await client.query(
        `UPDATE attendance_sessions
         SET
           punch_out_at = $2,
           punch_out_latitude = $3,
           punch_out_longitude = $4,
           punch_out_accuracy_meters = $5,
           punch_out_distance_meters = $6,
           punch_out_attendance_location_id = $7,
           punch_out_reason = 'MANUAL',
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [
          currentSession.id,
          context.database_now,
          input.position.latitude,
          input.position.longitude,
          input.position.accuracyMeters,
          resolved.distance,
          resolved.location?.id ?? null,
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
