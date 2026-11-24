-- Grievance employee code: the employee's code as the HR system holds it (for example EMP-1021). employee_id stays
-- the uuid reference to a user. The code is optional, trimmed, and at most 60 characters.

ALTER TABLE core_grievance
  ADD COLUMN employee_code text;

ALTER TABLE core_grievance
  ADD CONSTRAINT core_grievance_employee_code_check
    CHECK (employee_code IS NULL OR (char_length(employee_code) BETWEEN 1 AND 60 AND employee_code = btrim(employee_code)));
