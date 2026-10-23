CREATE TABLE work_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name CITEXT NOT NULL UNIQUE,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  max_duration_minutes INTEGER NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT work_shifts_time_order CHECK (end_time > start_time),
  CONSTRAINT work_shifts_duration_range CHECK (max_duration_minutes BETWEEN 1 AND 1440)
);

INSERT INTO work_shifts (
  id,
  name,
  start_time,
  end_time,
  max_duration_minutes,
  timezone
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'General Shift',
  '10:00:00',
  '18:00:00',
  480,
  'Asia/Kolkata'
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  max_duration_minutes = EXCLUDED.max_duration_minutes,
  timezone = EXCLUDED.timezone,
  is_active = TRUE,
  updated_at = NOW();

ALTER TABLE employee_profiles
ADD COLUMN shift_id UUID NOT NULL
  DEFAULT '00000000-0000-0000-0000-000000000001'
  REFERENCES work_shifts(id) ON DELETE RESTRICT;

CREATE TABLE attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  attendance_location_id UUID NOT NULL REFERENCES attendance_locations(id) ON DELETE RESTRICT,
  punch_in_at TIMESTAMPTZ NOT NULL,
  punch_in_latitude NUMERIC(9, 6) NOT NULL,
  punch_in_longitude NUMERIC(9, 6) NOT NULL,
  punch_in_accuracy_meters NUMERIC(8, 2) NOT NULL,
  punch_in_distance_meters NUMERIC(8, 2) NOT NULL,
  punch_out_at TIMESTAMPTZ,
  punch_out_latitude NUMERIC(9, 6),
  punch_out_longitude NUMERIC(9, 6),
  punch_out_accuracy_meters NUMERIC(8, 2),
  punch_out_distance_meters NUMERIC(8, 2),
  punch_out_reason VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT attendance_sessions_one_per_day UNIQUE (employee_user_id, attendance_date),
  CONSTRAINT attendance_sessions_punch_out_complete CHECK (
    (punch_out_at IS NULL
      AND punch_out_latitude IS NULL
      AND punch_out_longitude IS NULL
      AND punch_out_accuracy_meters IS NULL
      AND punch_out_distance_meters IS NULL
      AND punch_out_reason IS NULL)
    OR
    (punch_out_at IS NOT NULL AND punch_out_reason IS NOT NULL)
  ),
  CONSTRAINT attendance_sessions_time_order CHECK (
    punch_out_at IS NULL OR punch_out_at >= punch_in_at
  ),
  CONSTRAINT attendance_sessions_punch_out_reason CHECK (
    punch_out_reason IS NULL
    OR punch_out_reason IN ('MANUAL', 'AUTO_SHIFT_END', 'AUTO_MAX_DURATION')
  )
);

CREATE UNIQUE INDEX attendance_sessions_one_open_per_employee_idx
  ON attendance_sessions(employee_user_id)
  WHERE punch_out_at IS NULL;

CREATE INDEX attendance_sessions_employee_date_idx
  ON attendance_sessions(employee_user_id, attendance_date DESC);

CREATE INDEX attendance_sessions_open_idx
  ON attendance_sessions(punch_out_at)
  WHERE punch_out_at IS NULL;
