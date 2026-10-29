ALTER TABLE attendance_sessions
DROP CONSTRAINT attendance_sessions_punch_out_reason;

ALTER TABLE attendance_sessions
ADD CONSTRAINT attendance_sessions_punch_out_reason CHECK (
  punch_out_reason IS NULL
  OR punch_out_reason IN ('MANUAL', 'AUTO_SHIFT_END', 'AUTO_MAX_DURATION', 'MISSED_CHECKOUT')
);

COMMENT ON COLUMN attendance_sessions.punch_out_reason IS
  'How the session ended. MISSED_CHECKOUT means the employee did not check out before the attendance day ended.';
