# Storage Alert System

The storage alert system monitors per-destination storage usage and sends notifications when configurable thresholds are crossed. It runs automatically after every storage statistics refresh cycle.

**Location**: `src/services/storage/storage-alert-service.ts`

## Alert Types

Three independent alert types can be enabled per storage destination:

### Usage Spike

Compares the two most recent storage snapshots. Sends an alert if the size changed by more than `usageSpikeThresholdPercent` percent in either direction.

Requires at least two snapshots — no alert fires on the first measurement.

**Notification event**: `STORAGE_USAGE_SPIKE`

### Storage Limit

Triggers when storage usage reaches or exceeds 90% of the configured `storageLimitBytes`. The 90% threshold is hard-coded; the configurable value is the upper limit in bytes.

**Notification event**: `STORAGE_LIMIT_WARNING`

### Missing Backup

Checks how long ago the backup count in storage last increased. If no new backup has appeared in `missingBackupHours` hours, an alert fires. Uses up to the last 100 snapshots as history.

**Notification event**: `STORAGE_MISSING_BACKUP`

## Configuration

Alert configuration is stored per-destination in the `SystemSetting` table under the key `storage.alerts.<configId>`. Retrieve and save it with:

```typescript
import { getAlertConfig, saveAlertConfig } from "@/services/storage/storage-alert-service";

const config = await getAlertConfig(configId);
await saveAlertConfig(configId, {
  usageSpikeEnabled: true,
  usageSpikeThresholdPercent: 50,       // alert on ≥50% size change
  storageLimitEnabled: true,
  storageLimitBytes: 10 * 1024 ** 3,    // 10 GB limit
  missingBackupEnabled: false,
  missingBackupHours: 48,               // alert if no backup in 48 h
});
```

### `StorageAlertConfig` interface

```typescript
export interface StorageAlertConfig {
  usageSpikeEnabled: boolean;
  usageSpikeThresholdPercent: number;  // e.g. 50 = 50%

  storageLimitEnabled: boolean;
  storageLimitBytes: number;           // bytes

  missingBackupEnabled: boolean;
  missingBackupHours: number;
}
```

**Defaults** (for destinations with no saved config):

| Field | Default |
|-------|---------|
| `usageSpikeEnabled` | `false` |
| `usageSpikeThresholdPercent` | `50` |
| `storageLimitEnabled` | `false` |
| `storageLimitBytes` | `10737418240` (10 GB) |
| `missingBackupEnabled` | `false` |
| `missingBackupHours` | `48` |

## State Tracking

The service tracks the active/inactive state of each alert type separately to prevent notification flooding:

```typescript
export interface AlertTypeState {
  active: boolean;             // whether the condition is currently active
  lastNotifiedAt: string | null;  // ISO timestamp of last notification sent
}

export interface StorageAlertStates {
  usageSpike: AlertTypeState;
  storageLimit: AlertTypeState;
  missingBackup: AlertTypeState;
}
```

State is persisted per-destination in `SystemSetting` under the key `storage.alerts.<configId>.state`.

### Notification Lifecycle

| Transition | Behavior |
|------------|----------|
| Inactive - Active | Notification sent immediately |
| Active - Active (cooldown not elapsed) | No notification |
| Active - Active (cooldown elapsed) | Reminder notification sent |
| Active - Inactive | State reset; next occurrence fires immediately |

**Default cooldown**: 24 hours (`ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000`).

The cooldown can be overridden per notification event via the reminder interval setting in Settings - Notifications. Setting the interval to `0` disables reminders (only the first occurrence fires).

## Trigger Point

`checkStorageAlerts(entries)` is called by the storage service after saving new snapshots during the `REFRESH_STORAGE_STATS` system task (runs hourly by default):

```typescript
import { checkStorageAlerts } from "@/services/storage/storage-alert-service";

// Called automatically after saveStorageSnapshots()
await checkStorageAlerts(storageVolumeEntries);
```

Each `StorageVolumeEntry` must include a `configId` (the `AdapterConfig.id` of the destination). Entries without a `configId` are skipped.

## Disabling Alerts for a Destination

If all three alert types are disabled for a destination, the service short-circuits and skips the state load entirely — no database queries are made for that destination.

Disabling an alert type while it is active automatically resets its state (clears `active` and `lastNotifiedAt`), so it does not fire again immediately if re-enabled.

## Related

- [System Tasks](/developer-guide/core/services) - `REFRESH_STORAGE_STATS` task that triggers checks
- [Notification Events](/developer-guide/advanced/healthcheck) - event types and notification configuration
- [Integrity Checks](/developer-guide/core/integrity) - file-level verification of stored backups
