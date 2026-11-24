-- Plan line stage: the working stage the UI shows (people: planned, confirmed, fulfilled; material: planned,
-- requested, ordered, received; equipment: planned only). Separate from status (draft, approved, cancelled), which is
-- unchanged. Optional.

ALTER TABLE core_plan_line
  ADD COLUMN stage text;

ALTER TABLE core_plan_line
  ADD CONSTRAINT core_plan_line_stage_check
    CHECK (stage IS NULL OR stage IN ('planned', 'confirmed', 'fulfilled', 'requested', 'ordered', 'received')),
  ADD CONSTRAINT core_plan_line_stage_kind_check
    CHECK (
      stage IS NULL
      OR stage = 'planned'
      OR (resource_kind = 'people' AND stage IN ('confirmed', 'fulfilled'))
      OR (resource_kind = 'material' AND stage IN ('requested', 'ordered', 'received'))
    );
