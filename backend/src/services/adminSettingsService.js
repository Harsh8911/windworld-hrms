const { pool } = require("../db/pool");
const { AppError } = require("../errors/AppError");

const GENERAL_SHIFT_ID = "00000000-0000-0000-0000-000000000001";

function publicShift(row) {
  return {
    id: row.id,
    name: row.name,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
    maxDurationMinutes: row.max_duration_minutes,
    timezone: row.timezone,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function getAdminSettings() {
  const result = await pool.query(
    `SELECT id, name, start_time::text, end_time::text,
            max_duration_minutes, timezone, updated_at
     FROM work_shifts
     WHERE id = $1 AND is_active = TRUE`,
    [GENERAL_SHIFT_ID],
  );

  if (result.rowCount === 0) {
    throw new AppError(404, "SHIFT_NOT_FOUND", "The general attendance shift was not found");
  }

  return { shift: publicShift(result.rows[0]) };
}

async function updateGeneralShift(input, adminUserId) {
  const timezoneResult = await pool.query(
    "SELECT 1 FROM pg_timezone_names WHERE name = $1 LIMIT 1",
    [input.timezone],
  );
  if (timezoneResult.rowCount === 0) {
    throw new AppError(
      422,
      "INVALID_TIMEZONE",
      "Enter a valid IANA timezone, for example Asia/Kolkata",
    );
  }

  try {
    const result = await pool.query(
      `UPDATE work_shifts
       SET name = $2,
           start_time = $3::time,
           end_time = $4::time,
           max_duration_minutes = $5,
           timezone = $6,
           updated_by = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND is_active = TRUE
       RETURNING id, name, start_time::text, end_time::text,
                 max_duration_minutes, timezone, updated_at`,
      [
        GENERAL_SHIFT_ID,
        input.name,
        input.startTime,
        input.endTime,
        input.maxDurationMinutes,
        input.timezone,
        adminUserId,
      ],
    );

    if (result.rowCount === 0) {
      throw new AppError(404, "SHIFT_NOT_FOUND", "The general attendance shift was not found");
    }

    return { shift: publicShift(result.rows[0]) };
  } catch (error) {
    if (error.code === "23505") {
      throw new AppError(409, "SHIFT_NAME_EXISTS", "A shift with this name already exists");
    }
    throw error;
  }
}

module.exports = { getAdminSettings, updateGeneralShift };
