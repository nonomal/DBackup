-- Migrate notificationEvents from legacy enum values to pipe-delimited multi-select format
UPDATE "Job" SET "notificationEvents" =
  CASE
    WHEN "notificationEvents" = 'ALWAYS' THEN 'SUCCESS|PARTIAL|FAILED'
    WHEN "notificationEvents" = 'FAILURE_ONLY' THEN 'PARTIAL|FAILED'
    WHEN "notificationEvents" = 'SUCCESS_ONLY' THEN 'SUCCESS'
    ELSE 'SUCCESS|PARTIAL|FAILED'
  END;
