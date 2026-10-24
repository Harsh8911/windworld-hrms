-- Managers may punch from an arbitrary GPS position that is not a configured
-- attendance location. The captured latitude, longitude, and accuracy remain
-- mandatory; only the configured-location reference and derived distance are
-- optional for these sessions.
ALTER TABLE attendance_sessions
  ALTER COLUMN attendance_location_id DROP NOT NULL,
  ALTER COLUMN punch_in_distance_meters DROP NOT NULL;

COMMENT ON COLUMN attendance_sessions.attendance_location_id IS
  'Configured punch-in location when recognized; NULL for coordinate-only manager punches.';

COMMENT ON COLUMN attendance_sessions.punch_in_distance_meters IS
  'Distance from the configured location center; NULL when no configured location applies.';
