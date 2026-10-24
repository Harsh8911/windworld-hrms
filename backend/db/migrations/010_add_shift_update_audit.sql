ALTER TABLE work_shifts
ADD COLUMN updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN work_shifts.updated_by IS
  'Administrator who most recently changed the shift attendance policy.';
