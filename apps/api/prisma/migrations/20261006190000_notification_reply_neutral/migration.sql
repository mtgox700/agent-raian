-- Any human reply is notified, including the ones classified NEUTRAL (unclear
-- intent, or keyword fallback when the LLM is down). Additive enum value.
ALTER TYPE "NotificationType" ADD VALUE 'LEAD_REPLIED_NEUTRAL';
