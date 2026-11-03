-- LinkedIn first-contact invitation note (≤300 chars, LinkedIn hard cap).
--
-- A LinkedIn step used to carry a single `body`, reused verbatim as the note of
-- a connection request when the lead was not a 1st-degree relation. The note was
-- then cut at 275 chars mid-word. `inviteNote` stores a variant written FOR that
-- format; `body` keeps serving the full DM once the invitation is accepted.
--
-- Nullable on purpose: email steps, follow-up steps and every pre-existing
-- campaign keep NULL and fall back to a safely-fitted `body`.
ALTER TABLE "CampaignEmailStep" ADD COLUMN "inviteNote" TEXT;
