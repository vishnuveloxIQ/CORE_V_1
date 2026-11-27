-- Who hired a unit: HO (Head Office) or the module of the head who registered it (FEM). Set by the registration form.
ALTER TABLE core_equipment_unit ADD COLUMN hired_from text;
