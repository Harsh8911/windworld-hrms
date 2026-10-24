DO $$
BEGIN
  CREATE TYPE employee_role AS ENUM ('EMPLOYEE', 'MANAGER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE employee_profiles
ADD COLUMN employee_role employee_role NOT NULL DEFAULT 'EMPLOYEE';

CREATE TABLE employee_attendance_locations (
  employee_user_id UUID NOT NULL REFERENCES employee_profiles(user_id) ON DELETE CASCADE,
  attendance_location_id UUID NOT NULL REFERENCES attendance_locations(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (employee_user_id, attendance_location_id)
);

CREATE INDEX employee_attendance_locations_location_id_idx
  ON employee_attendance_locations(attendance_location_id);

INSERT INTO employee_attendance_locations (
  employee_user_id,
  attendance_location_id,
  assigned_by
)
SELECT
  profiles.user_id,
  profiles.attendance_location_id,
  profiles.created_by
FROM employee_profiles AS profiles
WHERE profiles.attendance_location_id IS NOT NULL
ON CONFLICT (employee_user_id, attendance_location_id) DO NOTHING;

ALTER TABLE attendance_sessions
ADD COLUMN punch_out_attendance_location_id UUID
  REFERENCES attendance_locations(id) ON DELETE RESTRICT;

CREATE INDEX attendance_sessions_punch_out_location_id_idx
  ON attendance_sessions(punch_out_attendance_location_id);

COMMENT ON COLUMN employee_profiles.attendance_location_id IS
  'Deprecated single-location field retained for safe rolling deployments. Use employee_attendance_locations.';

