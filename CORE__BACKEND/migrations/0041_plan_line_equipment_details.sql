-- Equipment plan lines: the capacity and model the project needs. All three are optional, and the planner fills them in.
ALTER TABLE core_plan_line
  ADD COLUMN capacity numeric(12,2),
  ADD COLUMN capacity_unit text,
  ADD COLUMN model text,
  ADD CONSTRAINT core_plan_line_capacity_check CHECK (capacity IS NULL OR capacity > 0),
  ADD CONSTRAINT core_plan_line_capacity_unit_check CHECK (capacity_unit IS NULL OR capacity_unit IN ('kVA', 'kW', 'HP', 'Ton')),
  ADD CONSTRAINT core_plan_line_model_check CHECK (model IS NULL OR char_length(model) <= 100);
