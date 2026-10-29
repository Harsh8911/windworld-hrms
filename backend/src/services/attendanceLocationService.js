const { pool } = require("../db/pool");
const { AppError } = require("../errors/AppError");

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
    createdAt: location.created_at,
    updatedAt: location.updated_at,
  };
}

async function createAttendanceLocation(input, adminUserId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (input.isPrimary) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('windworld_primary_attendance_location'))",
      );
      await client.query(
        `UPDATE attendance_locations
         SET is_primary = FALSE, updated_at = NOW()
         WHERE is_primary = TRUE AND is_active = TRUE`,
      );
    }

    const result = await client.query(
      `INSERT INTO attendance_locations (
         name, latitude, longitude, wifi_ip, geofence_radius_meters, is_primary, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, latitude, longitude, wifi_ip, geofence_radius_meters,
         is_primary, is_active, created_at, updated_at`,
      [
        input.name,
        input.latitude,
        input.longitude,
        input.wifiIp ?? null,
        input.geofenceRadiusMeters,
        input.isPrimary,
        adminUserId,
      ],
    );

    await client.query("COMMIT");
    return publicLocation(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505" && error.constraint === "attendance_locations_name_key") {
      throw new AppError(409, "LOCATION_NAME_EXISTS", "An attendance location with this name already exists");
    }

    throw error;
  } finally {
    client.release();
  }
}

async function listAttendanceLocations({ includeInactive }) {
  const result = await pool.query(
    `SELECT id, name, latitude, longitude, wifi_ip, geofence_radius_meters,
       is_primary, is_active, created_at, updated_at
     FROM attendance_locations
     WHERE ($1::boolean = TRUE OR is_active = TRUE)
     ORDER BY is_primary DESC, name ASC`,
    [includeInactive],
  );

  return result.rows.map(publicLocation);
}

async function updateAttendanceLocation(locationId, input) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const existing = await client.query(
      "SELECT id, is_active FROM attendance_locations WHERE id = $1 FOR UPDATE",
      [locationId],
    );
    if (existing.rowCount === 0) {
      throw new AppError(404, "LOCATION_NOT_FOUND", "Attendance location not found");
    }
    if (!existing.rows[0].is_active) {
      throw new AppError(409, "LOCATION_ARCHIVED", "Restore this location before editing it");
    }

    if (input.isPrimary) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('windworld_primary_attendance_location'))",
      );
      await client.query(
        `UPDATE attendance_locations
         SET is_primary = FALSE, updated_at = NOW()
         WHERE id <> $1 AND is_primary = TRUE AND is_active = TRUE`,
        [locationId],
      );
    }

    const result = await client.query(
      `UPDATE attendance_locations
       SET name = $2, latitude = $3, longitude = $4, wifi_ip = $5,
         geofence_radius_meters = $6, is_primary = $7, updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, latitude, longitude, wifi_ip, geofence_radius_meters,
         is_primary, is_active, created_at, updated_at`,
      [
        locationId,
        input.name,
        input.latitude,
        input.longitude,
        input.wifiIp ?? null,
        input.geofenceRadiusMeters,
        input.isPrimary,
      ],
    );
    await client.query("COMMIT");
    return publicLocation(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505" && error.constraint === "attendance_locations_name_key") {
      throw new AppError(409, "LOCATION_NAME_EXISTS", "An attendance location with this name already exists");
    }
    throw error;
  } finally {
    client.release();
  }
}

async function setAttendanceLocationArchived(locationId, archived) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE attendance_locations
       SET is_active = $2, is_primary = CASE WHEN $2 THEN is_primary ELSE FALSE END,
         updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, latitude, longitude, wifi_ip, geofence_radius_meters,
         is_primary, is_active, created_at, updated_at`,
      [locationId, !archived],
    );
    if (result.rowCount === 0) {
      throw new AppError(404, "LOCATION_NOT_FOUND", "Attendance location not found");
    }
    if (archived) {
      await client.query(
        "DELETE FROM employee_attendance_locations WHERE attendance_location_id = $1",
        [locationId],
      );
      await client.query(
        `UPDATE employee_profiles
         SET attendance_location_id = NULL, updated_at = NOW()
         WHERE attendance_location_id = $1`,
        [locationId],
      );
    }
    await client.query("COMMIT");
    return publicLocation(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deleteAttendanceLocation(locationId) {
  try {
    const result = await pool.query(
      "DELETE FROM attendance_locations WHERE id = $1 RETURNING id",
      [locationId],
    );
    if (result.rowCount === 0) {
      throw new AppError(404, "LOCATION_NOT_FOUND", "Attendance location not found");
    }
  } catch (error) {
    if (error.code === "23503") {
      throw new AppError(
        409,
        "LOCATION_HAS_ATTENDANCE_HISTORY",
        "This location has attendance history and cannot be deleted. Archive it instead.",
      );
    }
    throw error;
  }
}

module.exports = {
  createAttendanceLocation,
  deleteAttendanceLocation,
  listAttendanceLocations,
  setAttendanceLocationArchived,
  updateAttendanceLocation,
};
