CREATE TABLE employee_id_counter (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  last_value BIGINT NOT NULL CHECK (last_value >= 0)
);

INSERT INTO employee_id_counter (id, last_value)
SELECT
  1,
  COALESCE(
    MAX(substring(upper(employee_id::text) FROM '^WW-([0-9]+)$')::BIGINT),
    0
  )
FROM employee_profiles
WHERE employee_id::text ~* '^WW-[0-9]+$'
ON CONFLICT (id) DO UPDATE
SET last_value = GREATEST(employee_id_counter.last_value, EXCLUDED.last_value);
