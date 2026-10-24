const { pool } = require("../db/pool");
const { autoPunchOutExpiredSessions } = require("./attendanceService");

const REPORTING_TIMEZONE = "Asia/Kolkata";

function dateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function addUtcDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getPeriodRange(anchorDate, period) {
  const [year, month, day] = anchorDate.split("-").map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day));
  const start = new Date(anchor);

  if (period === "weekly") {
    const weekday = start.getUTCDay();
    start.setUTCDate(start.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  } else if (period === "monthly") {
    start.setUTCDate(1);
  }

  let endExclusive;
  if (period === "daily") endExclusive = addUtcDays(start, 1);
  else if (period === "weekly") endExclusive = addUtcDays(start, 7);
  else {
    endExclusive = new Date(start);
    endExclusive.setUTCMonth(endExclusive.getUTCMonth() + 1);
  }

  return {
    startDate: dateOnly(start),
    endDate: dateOnly(addUtcDays(endExclusive, -1)),
    endExclusive: dateOnly(endExclusive),
  };
}

function nullableNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function publicAdminLog(row) {
  const punchInAt = new Date(row.punch_in_at);
  const punchOutAt = row.punch_out_at ? new Date(row.punch_out_at) : null;

  return {
    id: row.id,
    attendanceDate: dateOnly(row.attendance_date),
    employee: {
      id: row.employee_user_id,
      employeeId: row.employee_id,
      fullName: row.full_name,
      designation: row.designation,
      department: row.department,
    },
    location: row.attendance_location_id
      ? {
          id: row.attendance_location_id,
          name: row.location_name,
        }
      : { id: null, name: "Current GPS location" },
    shift: {
      name: row.shift_name,
      startTime: row.shift_start_time.slice(0, 5),
      endTime: row.shift_end_time.slice(0, 5),
      timezone: row.timezone,
    },
    punchInAt: punchInAt.toISOString(),
    punchOutAt: punchOutAt?.toISOString() ?? null,
    durationMinutes: Number(row.duration_minutes),
    status: punchOutAt ? "COMPLETED" : "IN_PROGRESS",
    isLate: Boolean(row.is_late),
    punchOutReason: row.punch_out_reason,
    punchIn: {
      latitude: Number(row.punch_in_latitude),
      longitude: Number(row.punch_in_longitude),
      accuracyMeters: Number(row.punch_in_accuracy_meters),
      distanceMeters: nullableNumber(row.punch_in_distance_meters),
    },
    punchOut:
      punchOutAt && row.punch_out_latitude !== null
        ? {
            latitude: nullableNumber(row.punch_out_latitude),
            longitude: nullableNumber(row.punch_out_longitude),
            accuracyMeters: nullableNumber(row.punch_out_accuracy_meters),
            distanceMeters: nullableNumber(row.punch_out_distance_meters),
            location: row.punch_out_attendance_location_id
              ? {
                  id: row.punch_out_attendance_location_id,
                  name: row.punch_out_location_name,
                }
              : { id: null, name: "Current GPS location" },
          }
        : null,
  };
}

async function listAdminAttendanceLogs({ period, anchorDate, search, limit, offset }) {
  await autoPunchOutExpiredSessions();

  let resolvedAnchorDate = anchorDate;
  if (!resolvedAnchorDate) {
    const todayResult = await pool.query(
      "SELECT TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE $1, 'YYYY-MM-DD') AS today",
      [REPORTING_TIMEZONE],
    );
    resolvedAnchorDate = dateOnly(todayResult.rows[0].today);
  }

  const range = getPeriodRange(resolvedAnchorDate, period);
  const normalizedSearch = search.trim();
  const parameters = [range.startDate, range.endExclusive, normalizedSearch];
  const filter = `
    sessions.attendance_date >= $1::date
    AND sessions.attendance_date < $2::date
    AND (
      $3 = ''
      OR users.full_name ILIKE '%' || $3 || '%'
      OR profiles.employee_id ILIKE '%' || $3 || '%'
      OR COALESCE(profiles.department, '') ILIKE '%' || $3 || '%'
    )`;
  const durationExpression = `FLOOR(EXTRACT(EPOCH FROM (
    COALESCE(sessions.punch_out_at, CURRENT_TIMESTAMP) - sessions.punch_in_at
  )) / 60)::int`;
  const lateExpression = `(
    (sessions.punch_in_at AT TIME ZONE shifts.timezone)::time > shifts.start_time
  )`;

  const [summaryResult, logsResult] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total_records,
         COUNT(DISTINCT sessions.employee_user_id)::int AS unique_employees,
         COUNT(*) FILTER (WHERE sessions.punch_out_at IS NULL)::int AS in_progress,
         COUNT(*) FILTER (WHERE ${lateExpression})::int AS late_records,
         COALESCE(SUM(${durationExpression}), 0)::bigint AS total_minutes
       FROM attendance_sessions AS sessions
       JOIN users ON users.id = sessions.employee_user_id
       JOIN employee_profiles AS profiles ON profiles.user_id = sessions.employee_user_id
       JOIN work_shifts AS shifts ON shifts.id = profiles.shift_id
       WHERE ${filter}`,
      parameters,
    ),
    pool.query(
      `SELECT
         sessions.*,
         TO_CHAR(sessions.attendance_date, 'YYYY-MM-DD') AS attendance_date,
         users.full_name,
         profiles.employee_id,
         profiles.designation,
         profiles.department,
         locations.name AS location_name,
         punch_out_locations.name AS punch_out_location_name,
         shifts.name AS shift_name,
         shifts.start_time::text AS shift_start_time,
         shifts.end_time::text AS shift_end_time,
         shifts.timezone,
         ${durationExpression} AS duration_minutes,
         ${lateExpression} AS is_late
       FROM attendance_sessions AS sessions
       JOIN users ON users.id = sessions.employee_user_id
       JOIN employee_profiles AS profiles ON profiles.user_id = sessions.employee_user_id
       LEFT JOIN attendance_locations AS locations ON locations.id = sessions.attendance_location_id
       LEFT JOIN attendance_locations AS punch_out_locations
         ON punch_out_locations.id = sessions.punch_out_attendance_location_id
       JOIN work_shifts AS shifts ON shifts.id = profiles.shift_id
       WHERE ${filter}
       ORDER BY sessions.attendance_date DESC, sessions.punch_in_at DESC
       LIMIT $4 OFFSET $5`,
      [...parameters, limit, offset],
    ),
  ]);

  const summary = summaryResult.rows[0];
  return {
    period,
    range: {
      anchorDate: resolvedAnchorDate,
      startDate: range.startDate,
      endDate: range.endDate,
      timezone: REPORTING_TIMEZONE,
    },
    summary: {
      totalRecords: summary.total_records,
      uniqueEmployees: summary.unique_employees,
      inProgress: summary.in_progress,
      lateRecords: summary.late_records,
      totalMinutes: Number(summary.total_minutes),
    },
    logs: logsResult.rows.map(publicAdminLog),
    pagination: {
      limit,
      offset,
      hasMore: offset + logsResult.rowCount < summary.total_records,
    },
  };
}

module.exports = { listAdminAttendanceLogs };
