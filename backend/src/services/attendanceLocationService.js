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

module.exports = { createAttendanceLocation, listAttendanceLocations };
