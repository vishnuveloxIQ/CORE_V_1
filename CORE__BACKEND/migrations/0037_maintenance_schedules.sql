-- Maintenance schedules (owner decision, 2026-11-22): how often each machine is serviced. A schedule belongs to one
-- equipment unit and names one task (for example "General service"); a unit may have several tasks. The task is due
-- every interval_months, or every interval_hours of running time, whichever comes first; at least one is set.
-- The last service date and meter hours are recorded so the next due point can be worked out. Standard columns
-- follow 0001.

CREATE TABLE core_maintenance_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_unit_id uuid NOT NULL REFERENCES core_equipment_unit (id),
  task text NOT NULL,
  interval_months integer,
  interval_hours integer,
  last_service_date date,
  last_service_hours numeric(10,1),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT core_maintenance_schedule_task_check CHECK (char_length(task) BETWEEN 1 AND 100 AND task = btrim(task)),
  CONSTRAINT core_maintenance_schedule_interval_check CHECK (interval_months IS NOT NULL OR interval_hours IS NOT NULL),
  CONSTRAINT core_maintenance_schedule_months_check CHECK (interval_months IS NULL OR interval_months BETWEEN 1 AND 120),
  CONSTRAINT core_maintenance_schedule_hours_check CHECK (interval_hours IS NULL OR interval_hours BETWEEN 1 AND 100000),
  CONSTRAINT core_maintenance_schedule_last_hours_check CHECK (last_service_hours IS NULL OR last_service_hours >= 0),
  CONSTRAINT core_maintenance_schedule_notes_check CHECK (notes IS NULL OR char_length(notes) <= 1000),
  CONSTRAINT core_maintenance_schedule_row_version_check CHECK (row_version >= 1)
);

-- One schedule per task on a unit, compared without regard to case.
CREATE UNIQUE INDEX core_maintenance_schedule_unit_task_key ON core_maintenance_schedule (equipment_unit_id, lower(task));
