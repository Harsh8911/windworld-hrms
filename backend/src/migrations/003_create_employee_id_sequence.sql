CREATE SEQUENCE employee_id_sequence
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE
  NO CYCLE;

DO $$
DECLARE
  highest_existing_number BIGINT;
BEGIN
  SELECT COALESCE(
    MAX(substring(upper(employee_id::text) FROM '^WW-([0-9]+)$')::BIGINT),
    0
  )
  INTO highest_existing_number
  FROM employee_profiles
  WHERE employee_id::text ~* '^WW-[0-9]+$';

  IF highest_existing_number > 0 THEN
    PERFORM setval('employee_id_sequence', highest_existing_number, TRUE);
  ELSE
    PERFORM setval('employee_id_sequence', 1, FALSE);
  END IF;
END
$$;
