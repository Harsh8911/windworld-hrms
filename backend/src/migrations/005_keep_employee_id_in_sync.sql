UPDATE employee_profiles AS profiles
SET
  employee_id = users.username,
  updated_at = NOW()
FROM users
WHERE users.id = profiles.user_id
  AND users.role = 'EMPLOYEE'
  AND profiles.employee_id IS DISTINCT FROM users.username;

UPDATE employee_id_counter
SET last_value = (
  SELECT COALESCE(
    MAX(substring(upper(employee_id::text) FROM '^WW-([0-9]+)$')::BIGINT),
    0
  )
  FROM employee_profiles
  WHERE employee_id::text ~* '^WW-[0-9]+$'
)
WHERE id = 1;

CREATE OR REPLACE FUNCTION sync_employee_profile_id_to_username()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE users
  SET
    username = NEW.employee_id,
    updated_at = NOW()
  WHERE id = NEW.user_id
    AND role = 'EMPLOYEE'
    AND username IS DISTINCT FROM NEW.employee_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_employee_username_to_profile_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE employee_profiles
  SET
    employee_id = NEW.username,
    updated_at = NOW()
  WHERE user_id = NEW.id
    AND employee_id IS DISTINCT FROM NEW.username;

  RETURN NEW;
END;
$$;

CREATE TRIGGER employee_profiles_sync_employee_id
AFTER INSERT OR UPDATE OF employee_id ON employee_profiles
FOR EACH ROW
EXECUTE FUNCTION sync_employee_profile_id_to_username();

CREATE TRIGGER users_sync_employee_username
AFTER UPDATE OF username ON users
FOR EACH ROW
WHEN (NEW.role = 'EMPLOYEE' AND OLD.username IS DISTINCT FROM NEW.username)
EXECUTE FUNCTION sync_employee_username_to_profile_id();
