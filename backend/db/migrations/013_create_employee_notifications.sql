CREATE TABLE employee_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(120) NOT NULL,
  message VARCHAR(500) NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_notifications_type_not_blank CHECK (length(trim(type)) > 0),
  CONSTRAINT employee_notifications_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT employee_notifications_message_not_blank CHECK (length(trim(message)) > 0)
);

CREATE INDEX employee_notifications_employee_created_idx
  ON employee_notifications(employee_user_id, created_at DESC);

CREATE INDEX employee_notifications_unread_idx
  ON employee_notifications(employee_user_id, created_at DESC)
  WHERE read_at IS NULL;
