-- The answer to a ticket, written by the company administrator who answers it (tickets raised by other company users).
-- Stored on the ticket itself, at most 4000 characters. Null until it is answered.
ALTER TABLE core_ticket ADD COLUMN answer text;
ALTER TABLE core_ticket ADD CONSTRAINT core_ticket_answer_check CHECK (answer IS NULL OR char_length(answer) <= 4000);
