-- Migration: Add os_version to activations table
ALTER TABLE activations ADD COLUMN os_version TEXT;
