-- WBS is removed from the product. The WBS links on BOQ items and chainage markers go first, then the WBS table.
-- The WBS nodes themselves are deleted with the table.

ALTER TABLE core_boq_item
  DROP COLUMN IF EXISTS wbs_node_id;

ALTER TABLE core_chainage_marker
  DROP COLUMN IF EXISTS wbs_node_id;

DROP TABLE IF EXISTS core_wbs_node;
