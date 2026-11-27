-- A hired equipment unit is registered against the approved equipment request that allowed the hire (the Core approval
-- reference). The project of the unit follows that request. Owned units have no approval request.

ALTER TABLE core_equipment_unit
  ADD COLUMN approval_request_id uuid REFERENCES core_approval_request (id) ON DELETE RESTRICT;

CREATE INDEX core_equipment_unit_approval_request_id_idx ON core_equipment_unit (approval_request_id);
