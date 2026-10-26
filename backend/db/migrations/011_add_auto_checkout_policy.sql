ALTER TABLE work_shifts
ADD COLUMN auto_checkout_enabled BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN auto_checkout_delay_minutes INTEGER NOT NULL DEFAULT 30,
ADD CONSTRAINT work_shifts_auto_checkout_delay_range
  CHECK (auto_checkout_delay_minutes BETWEEN 30 AND 40);

COMMENT ON COLUMN work_shifts.auto_checkout_enabled IS
  'Whether open sessions are automatically closed after the scheduled shift end.';

COMMENT ON COLUMN work_shifts.auto_checkout_delay_minutes IS
  'Number of minutes after shift end to wait before automatically closing an open session.';

