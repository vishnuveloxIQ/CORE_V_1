-- Approval reminders (owner decision, 2026-11-22): a request is never escalated. When its current level's time runs
-- out, the person it waits on is reminded, and reminded again after each further interval, until someone acts.
-- last_reminded_at records the last reminder so the next one counts from it. It is set by the reminder sweep only and
-- does not change the row version, so an approver's open page does not go stale because of a reminder.

ALTER TABLE core_approval_request ADD COLUMN last_reminded_at timestamptz;

-- The sweep looks only at requests that wait on someone.
CREATE INDEX core_approval_request_waiting_idx ON core_approval_request (status)
  WHERE status IN ('pending', 'clarification_requested');
