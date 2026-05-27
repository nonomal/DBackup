-- Fix: Rename built-in retention template from "Smart GVS" to "Smart GFS" (correct Grandfather-Father-Son abbreviation)
-- Guard: skip if the target name already exists (user may have created a policy with that name)
-- to avoid a unique-constraint failure on the "name" column.
UPDATE "RetentionPolicy"
SET "name" = 'Smart GFS (7/4/12/2)',
    "description" = 'Grandfather-Father-Son: keep 7 daily, 4 weekly, 12 monthly, 2 yearly backups.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'retention-gvs-default'
  AND "name" = 'Smart GVS (7/4/12/2)'
  AND NOT EXISTS (
    SELECT 1 FROM "RetentionPolicy" WHERE "name" = 'Smart GFS (7/4/12/2)'
  );
