-- SENDING marks a provider call in progress: a worker that dies between the
-- provider call and the database write leaves this status, and the step is
-- then never retried, so a prospect never receives the same message twice.
ALTER TYPE "EmailSendStatus" ADD VALUE 'SENDING' AFTER 'PENDING';
