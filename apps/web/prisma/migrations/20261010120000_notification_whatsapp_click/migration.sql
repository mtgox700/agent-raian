-- A prospect opened the WhatsApp link of a campaign email (click-to-chat).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LEAD_CLICKED_WHATSAPP';
