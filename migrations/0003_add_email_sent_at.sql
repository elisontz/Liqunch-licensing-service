-- Migration: Add email_sent_at to licenses table
ALTER TABLE licenses ADD COLUMN email_sent_at TEXT;
