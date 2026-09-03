-- A2R Delivery OS — Work Package 5: Interactive Module Editors.
-- Hand-derived from prisma/schema.prisma for local verification (no npm
-- registry access in this sandbox — see 00000000000000_init's note).
-- Applied and verified against a real local Postgres instance. Regenerate
-- the authoritative migration history with `npx prisma migrate dev` the
-- first time this project is built somewhere with registry access.

-- ==================== AUDIT ENTRY: verification notes ====================
ALTER TABLE "audit_entries" ADD COLUMN "notes" TEXT;

-- ==================== RAID ENTRY: impact / mitigation plan ====================
ALTER TABLE "raid_entries" ADD COLUMN "impact" TEXT;
ALTER TABLE "raid_entries" ADD COLUMN "mitigationPlan" TEXT;

-- ==================== RAID ENTRY: title ====================
-- Short label the Quick-Add drawer collects separately from the longer
-- free-text description. Nullable — RaidBoard.tsx falls back to the first
-- ~60 chars of description for rows logged before this field existed.
ALTER TABLE "raid_entries" ADD COLUMN "title" TEXT;
