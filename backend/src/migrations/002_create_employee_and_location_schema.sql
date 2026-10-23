DO $$
BEGIN
  CREATE TYPE employment_status AS ENUM ('ACTIVE', 'ON_LEAVE', 'INACTIVE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE attendance_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name CITEXT NOT NULL,
  latitude NUMERIC(9, 6) NOT NULL,
  longitude NUMERIC(9, 6) NOT NULL,
  wifi_ip INET,
  geofence_radius_meters INTEGER NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT attendance_locations_name_key UNIQUE (name),
  CONSTRAINT attendance_locations_name_not_blank CHECK (length(trim(name::text)) > 0),
  CONSTRAINT attendance_locations_latitude_range CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT attendance_locations_longitude_range CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT attendance_locations_radius_range CHECK (geofence_radius_meters BETWEEN 1 AND 100000)
);

CREATE UNIQUE INDEX attendance_locations_one_active_primary_idx
  ON attendance_locations (is_primary)
  WHERE is_primary = TRUE AND is_active = TRUE;

CREATE TABLE employee_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  employee_id CITEXT NOT NULL,
  phone VARCHAR(30),
  designation VARCHAR(120),
  department VARCHAR(120),
  attendance_location_id UUID REFERENCES attendance_locations(id) ON DELETE SET NULL,
  employment_status employment_status NOT NULL DEFAULT 'ACTIVE',
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_profiles_employee_id_key UNIQUE (employee_id),
  CONSTRAINT employee_profiles_employee_id_not_blank CHECK (length(trim(employee_id::text)) > 0),
  CONSTRAINT employee_profiles_phone_not_blank CHECK (phone IS NULL OR length(trim(phone)) > 0),
  CONSTRAINT employee_profiles_designation_not_blank CHECK (
    designation IS NULL OR length(trim(designation)) > 0
  ),
  CONSTRAINT employee_profiles_department_not_blank CHECK (
    department IS NULL OR length(trim(department)) > 0
  )
);

CREATE INDEX employee_profiles_attendance_location_id_idx
  ON employee_profiles(attendance_location_id);
CREATE INDEX employee_profiles_employment_status_idx
  ON employee_profiles(employment_status);
