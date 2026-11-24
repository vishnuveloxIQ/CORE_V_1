-- Phase 5a (design defaults recorded in PROGRESS.md, Phase 5a block). Unique keys, CHECKs and indexes only;
-- the tables themselves are created in 0001. Value rules that need a calendar, a time zone or a tree walk
-- (IANA time zones, week-off days, settings keys, colour palette, cycles) are checked in the service layer.

-- Company profile: one row per tenant (design point b). Tax IDs are checked by format only.
CREATE UNIQUE INDEX core_company_profile_singleton_key ON core_company_profile ((true));
-- Company code is citext, so the unique key ignores case. Migration 0004 does not index citext columns.
CREATE UNIQUE INDEX core_company_profile_code_key ON core_company_profile (code);

ALTER TABLE core_company_profile
  ADD CONSTRAINT core_company_profile_status_check
    CHECK (status IS NULL OR status IN ('active', 'inactive')),
  ADD CONSTRAINT core_company_profile_gstin_check
    CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  ADD CONSTRAINT core_company_profile_pan_check
    CHECK (pan IS NULL OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  ADD CONSTRAINT core_company_profile_tan_check
    CHECK (tan IS NULL OR tan ~ '^[A-Z]{4}[0-9]{5}[A-Z]$'),
  ADD CONSTRAINT core_company_profile_cin_check
    CHECK (cin IS NULL OR cin ~ '^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$'),
  ADD CONSTRAINT core_company_profile_settings_check
    CHECK (settings_json IS NULL OR jsonb_typeof(settings_json) = 'object');

-- Holidays (design point e). Dates: the end date is empty for one day, or on or after the start.
ALTER TABLE core_holiday
  ADD CONSTRAINT core_holiday_type_check
    CHECK (holiday_type IS NULL OR holiday_type IN ('national', 'regional', 'company')),
  ADD CONSTRAINT core_holiday_dates_check
    CHECK (end_date IS NULL OR holiday_date IS NULL OR end_date >= holiday_date);

-- One holiday per date and scope. Company-wide rows (scope null) count as equal to each other.
CREATE UNIQUE INDEX core_holiday_date_scope_key
  ON core_holiday (holiday_date, scope_project_id) NULLS NOT DISTINCT;

-- Shifts (design point f). Codes are unique per tenant. Migration 0004 added a plain index on code; the unique key replaces it.
DROP INDEX IF EXISTS ix_core_shift_code;
CREATE UNIQUE INDEX core_shift_code_key ON core_shift (code);

ALTER TABLE core_shift
  ADD CONSTRAINT core_shift_timing_check
    CHECK (in_time IS NULL OR out_time IS NULL OR in_time <> out_time),
  ADD CONSTRAINT core_shift_effective_check
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  ADD CONSTRAINT core_shift_week_off_check
    CHECK (week_off_days_json IS NULL OR jsonb_typeof(week_off_days_json) = 'array');

-- Number series (design point g). Year scope 0 never resets; a year is 1900 to 9999. The counter starts at 1 or more.
DROP INDEX IF EXISTS ix_core_number_series_series_code;
CREATE UNIQUE INDEX core_number_series_code_scope_key
  ON core_number_series (series_code, year_scope) NULLS NOT DISTINCT;

ALTER TABLE core_number_series
  ADD CONSTRAINT core_number_series_year_scope_check
    CHECK (year_scope IS NULL OR year_scope = 0 OR year_scope BETWEEN 1900 AND 9999),
  ADD CONSTRAINT core_number_series_next_value_check
    CHECK (next_value IS NULL OR next_value >= 1);

-- Departments (design point h). Codes are unique without regard to case.
DROP INDEX IF EXISTS ix_core_department_code;
CREATE UNIQUE INDEX core_department_code_key ON core_department (lower(code));

ALTER TABLE core_department
  ADD CONSTRAINT core_department_status_check
    CHECK (status IS NULL OR status IN ('active', 'inactive')),
  ADD CONSTRAINT core_department_parent_check
    CHECK (parent_department_id IS NULL OR parent_department_id <> id),
  ADD CONSTRAINT core_department_color_index_check
    CHECK (color_index IS NULL OR color_index BETWEEN 0 AND 11),
  ADD CONSTRAINT core_department_color_hex_check
    CHECK (color_hex IS NULL OR color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT core_department_color_pair_check
    CHECK ((color_index IS NULL) = (color_hex IS NULL));

-- Positions (design point i). Codes are unique without regard to case (citext).
CREATE UNIQUE INDEX core_position_code_key ON core_position (code);

ALTER TABLE core_position
  ADD CONSTRAINT core_position_status_check
    CHECK (status IS NULL OR status IN ('active', 'inactive')),
  ADD CONSTRAINT core_position_reports_to_check
    CHECK (reports_to_position_id IS NULL OR reports_to_position_id <> id),
  ADD CONSTRAINT core_position_planned_check
    CHECK (planned_positions IS NULL OR planned_positions >= 0);
