-- A user can hold more than one UI role: a module head may also be placed on approval levels (an approver).
-- user_roles lists them ('module_head', 'approver'); user_role (0024) is kept and reads as the first of them, so
-- older readers keep working. Existing rows get the role they had. Privileges still come from core_user_access.

ALTER TABLE core_user
  ADD COLUMN user_roles text[] NOT NULL DEFAULT '{}';

UPDATE core_user
   SET user_roles = ARRAY[user_role]
 WHERE user_role IS NOT NULL;

ALTER TABLE core_user
  ADD CONSTRAINT core_user_user_roles_check
    CHECK (user_roles <@ ARRAY['module_head', 'approver']::text[]);
