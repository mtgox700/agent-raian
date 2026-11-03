-- AlterEnum
-- Adds the SDR co-pilot approval notification type. Additive only; safe to
-- deploy. (A newly added enum value cannot be used in the same transaction as
-- its addition — application usage happens in later requests, so this is fine.)
ALTER TYPE "NotificationType" ADD VALUE 'SDR_APPROVAL_NEEDED';
