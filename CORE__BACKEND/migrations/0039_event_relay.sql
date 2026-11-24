-- Event relay (CORE-23-06, 24-06, 24-07). integ_event (0001) already holds the outbox (direction 'outbound') and the
-- inbox ('inbound') with attempts, next attempt, last error, dead-letter and replay fields. This adds what the relay and
-- the monitor need: one row per event id and direction (a second delivery is a duplicate), the relay's work queue in
-- due order, per-aggregate order, and the monitor's newest-first listing. The production transport is still open
-- (decision D13); nothing here depends on it.

CREATE UNIQUE INDEX integ_event_direction_event_id_key ON integ_event (direction, event_id);

-- The relay takes due outbound events oldest first.
CREATE INDEX integ_event_relay_queue_idx ON integ_event (next_attempt_at)
  WHERE direction = 'outbound' AND status = 'pending';

-- Events of one aggregate are delivered in aggregate_seq order.
CREATE INDEX integ_event_aggregate_seq_idx ON integ_event (direction, aggregate_type, aggregate_id, aggregate_seq);

-- The monitor lists events newest first, optionally by direction and status.
CREATE INDEX integ_event_monitor_idx ON integ_event (direction, status, created_at DESC);

ALTER TABLE integ_event
  ADD CONSTRAINT integ_event_replay_status_check
  CHECK (replay_status IS NULL OR replay_status IN ('requested', 'replayed'));
