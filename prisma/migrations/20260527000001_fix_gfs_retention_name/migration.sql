-- Fix: Rename built-in retention template from "Smart GVS" to "Smart GFS" (correct Grandfather-Father-Son abbreviation)
UPDATE "RetentionPolicy"
SET "name" = 'Smart GFS (7/4/12/2)',
    "description" = 'Grandfather-Father-Son: keep 7 daily, 4 weekly, 12 monthly, 2 yearly backups.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'retention-gvs-default'
  AND "name" = 'Smart GVS (7/4/12/2)';
