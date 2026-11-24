-- Phase 5b (design defaults recorded in PROGRESS.md, Phase 5b block). Unique keys, CHECKs, indexes and NOT NULL
-- constraints only; the tables themselves are created in 0001. Rules that need another row (the same project for
-- WBS parents, markers and stores; the milestone weight total; cycles) are checked in the service layer.
-- The tables are empty when this runs, so no backfill is needed.

-- Required columns. A code is NOT NULL too: NULLs are distinct in a unique index, so a null code would escape the key.
ALTER TABLE core_project
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN name SET NOT NULL;

ALTER TABLE core_location
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN project_id SET NOT NULL;

ALTER TABLE core_store
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN location_id SET NOT NULL;

ALTER TABLE core_wbs_node
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN project_id SET NOT NULL;

ALTER TABLE core_chainage_marker
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN chainage_km SET NOT NULL,
  ALTER COLUMN project_id SET NOT NULL;

ALTER TABLE core_geo_zone
  ALTER COLUMN project_id SET NOT NULL,
  ALTER COLUMN label SET NOT NULL,
  ALTER COLUMN zone_type SET NOT NULL,
  ALTER COLUMN shape SET NOT NULL,
  ALTER COLUMN version SET DEFAULT 1,
  ALTER COLUMN version SET NOT NULL;

ALTER TABLE core_project_milestone
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN project_id SET NOT NULL;

-- Unique keys. Codes are unique without regard to case (lower()). WBS and marker codes repeat across projects,
-- so their keys are per project (design points e and f).
CREATE UNIQUE INDEX core_project_code_key ON core_project (lower(code));
CREATE UNIQUE INDEX core_location_code_key ON core_location (lower(code));
CREATE UNIQUE INDEX core_store_code_key ON core_store (lower(code));
CREATE UNIQUE INDEX core_wbs_node_project_code_key ON core_wbs_node (project_id, lower(code));
CREATE UNIQUE INDEX core_chainage_marker_project_code_key ON core_chainage_marker (project_id, lower(code));

-- Foreign key indexes are not created here. Migration 0004 already indexes every single-column foreign key
-- (ix_<table>_<column>), and these tables' foreign keys all come from 0001, so creating them again fails.

-- Projects (design point b). Status is active or inactive; a project is closed, not deleted.
ALTER TABLE core_project
  ADD CONSTRAINT core_project_status_check
    CHECK (status IS NULL OR status IN ('active', 'inactive')),
  ADD CONSTRAINT core_project_dates_check
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
  ADD CONSTRAINT core_project_value_check
    CHECK (value_amount IS NULL OR value_amount >= 0);

-- Locations (design point c). Latitude and longitude are set together; chainage start and end are set together.
ALTER TABLE core_location
  ADD CONSTRAINT core_location_status_check
    CHECK (status IS NULL OR status IN ('active', 'inactive')),
  ADD CONSTRAINT core_location_coordinates_check
    CHECK ((latitude IS NULL) = (longitude IS NULL)),
  ADD CONSTRAINT core_location_latitude_check
    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT core_location_longitude_check
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT core_location_chainage_pair_check
    CHECK ((chainage_start_km IS NULL) = (chainage_end_km IS NULL)),
  ADD CONSTRAINT core_location_chainage_order_check
    CHECK (chainage_start_km IS NULL OR (chainage_start_km >= 0 AND chainage_start_km <= chainage_end_km)),
  ADD CONSTRAINT core_location_week_off_check
    CHECK (week_off_days_json IS NULL OR jsonb_typeof(week_off_days_json) = 'array');

-- Stores (design point d). Deactivated, not deleted.
ALTER TABLE core_store
  ADD CONSTRAINT core_store_status_check
    CHECK (status IS NULL OR status IN ('active', 'inactive'));

-- WBS nodes (design point e). A node is its own parent never.
ALTER TABLE core_wbs_node
  ADD CONSTRAINT core_wbs_node_status_check
    CHECK (status IS NULL OR status IN ('active', 'inactive')),
  ADD CONSTRAINT core_wbs_node_parent_check
    CHECK (parent_wbs_node_id IS NULL OR parent_wbs_node_id <> id);

-- Chainage markers (design point f). Chainage is zero or more.
ALTER TABLE core_chainage_marker
  ADD CONSTRAINT core_chainage_marker_km_check
    CHECK (chainage_km >= 0);

-- Geo zones (design point g). zone_type and shape are fixed vocabularies. Each shape names the fields it needs.
-- COALESCE and CASE make a missing value fail the check: a NULL result would otherwise pass a CHECK.
ALTER TABLE core_geo_zone
  ADD CONSTRAINT core_geo_zone_zone_type_check
    CHECK (zone_type IN ('attendance', 'equipment')),
  ADD CONSTRAINT core_geo_zone_shape_check
    CHECK (shape IN ('circle', 'polygon', 'corridor')),
  ADD CONSTRAINT core_geo_zone_version_check
    CHECK (version >= 1),
  ADD CONSTRAINT core_geo_zone_points_check
    CHECK (points_json IS NULL OR jsonb_typeof(points_json) = 'array'),
  ADD CONSTRAINT core_geo_zone_center_lat_check
    CHECK (center_lat IS NULL OR center_lat BETWEEN -90 AND 90),
  ADD CONSTRAINT core_geo_zone_center_lng_check
    CHECK (center_lng IS NULL OR center_lng BETWEEN -180 AND 180),
  ADD CONSTRAINT core_geo_zone_shape_fields_check
    CHECK (
      CASE shape
        WHEN 'circle' THEN
          center_lat IS NOT NULL AND center_lng IS NOT NULL
          AND COALESCE(radius_m, 0) > 0 AND points_json IS NULL
        WHEN 'polygon' THEN
          CASE WHEN jsonb_typeof(points_json) = 'array' THEN jsonb_array_length(points_json) ELSE 0 END >= 3
        WHEN 'corridor' THEN
          COALESCE(buffer_m, 0) > 0
          AND CASE WHEN jsonb_typeof(points_json) = 'array' THEN jsonb_array_length(points_json) ELSE 0 END >= 2
        ELSE false
      END
    );

-- Milestones (design point h). Weight is from 0 to 100; the total per project is checked in the service layer.
ALTER TABLE core_project_milestone
  ADD CONSTRAINT core_project_milestone_status_check
    CHECK (status IS NULL OR status IN ('pending', 'achieved', 'cancelled')),
  ADD CONSTRAINT core_project_milestone_weight_check
    CHECK (weight IS NULL OR weight BETWEEN 0 AND 100);
