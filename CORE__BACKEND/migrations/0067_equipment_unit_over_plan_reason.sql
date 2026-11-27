-- Why a unit was assigned to a project beyond the units its equipment planning allows. Cleared when the unit leaves the project.
ALTER TABLE core_equipment_unit ADD COLUMN over_plan_reason text;
