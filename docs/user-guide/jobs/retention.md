# Retention Policies

Automatically manage backup storage by defining how long to keep backups.

## Overview

Retention policies prevent unlimited storage growth by automatically deleting old backups. DBackup supports two retention modes:

| Mode | Description | Best For |
| :--- | :--- | :--- |
| **None** | Keep all backups | Manual management |
| **Simple** | Keep last N backups | Fixed rotation |
| **Smart (GFS)** | Grandfather-Father-Son | Long-term archival |

## Per-Destination Retention

Retention is configured **individually for each destination** within a job. This means a single job can have different retention strategies per storage location.

### Example

| Destination | Mode | Configuration |
| :--- | :--- | :--- |
| Local NAS | Simple | Keep last 30 |
| AWS S3 | Smart (GFS) | Daily: 7, Weekly: 4, Monthly: 12 |
| Dropbox | None | Keep all |

### Configuration

In the job form, expand each destination row to configure its retention:
1. Click the expand arrow on a destination
2. Select the retention mode (None / Simple / Smart)
3. Configure mode-specific settings
4. Each destination saves its retention independently

## Simple Retention

Keep a fixed number of recent backups.

### Configuration

| Setting | Description |
| :--- | :--- |
| **Keep Count** | Number of backups to retain |

### Example

With `Keep Count: 5`:
- After 6th backup: 1st is deleted
- After 7th backup: 2nd is deleted
- Always maintains exactly 5 backups

### Use Cases

- Development environments
- Frequent backups with short retention
- Simple rotation needs

## Smart Retention (GFS)

Grandfather-Father-Son is an intelligent retention strategy that keeps:
- Recent backups (daily)
- Some older backups (weekly)
- Fewer old backups (monthly)
- Minimal very old backups (yearly)

### Configuration

| Setting | Description | Example |
| :--- | :--- | :--- |
| **Daily** | Days to keep daily backups | `7` |
| **Weekly** | Weeks to keep weekly backups | `4` |
| **Monthly** | Months to keep monthly backups | `12` |
| **Yearly** | Years to keep yearly backups | `3` |

### How It Works

The algorithm evaluates each backup:

1. **Daily bucket**: Is this one of the last N days' backups?
2. **Weekly bucket**: Is this the most recent backup from the last N weeks?
3. **Monthly bucket**: Is this the most recent backup from the last N months?
4. **Yearly bucket**: Is this the most recent backup from the last N years?

A backup is kept if it qualifies for **any** bucket.

### Example Timeline

Configuration: Daily=7, Weekly=4, Monthly=12, Yearly=2

After 1 year of daily backups:
- **Days 1-7**: All 7 daily backups kept
- **Weeks 2-4**: 1 backup per week (3 more)
- **Months 2-12**: 1 backup per month (11 more)
- **Previous year**: 1 backup kept

**Total**: ~22 backups instead of 365!

### Visual Example

```
Today         7 days ago    1 month ago    1 year ago
  |             |              |              |
  ▼             ▼              ▼              ▼
[■][■][■][■][■][■][■]   [■]   [■]   [■]...  [■]
 └── Daily ──┘     └ Weekly ┘  └── Monthly ──┘
```

## Locked Backups

Prevent specific backups from being deleted:

1. Go to **Storage Explorer**
2. Find the backup
3. Click **Lock** icon

Locked backups:
- ✅ Never deleted by retention
- ✅ Don't count against limits
- ✅ Persist indefinitely

### Use Cases for Locking

- Pre-migration snapshots
- Known-good backups
- Compliance requirements
- Before major changes

## Configuration Guide

### Conservative (Long Retention)

```
Daily: 14
Weekly: 8
Monthly: 24
Yearly: 5
```

Keeps ~50 backups over 5 years.

### Moderate (Balanced)

```
Daily: 7
Weekly: 4
Monthly: 12
Yearly: 2
```

Keeps ~25 backups over 2 years.

### Aggressive (Minimal)

```
Daily: 3
Weekly: 2
Monthly: 6
Yearly: 1
```

Keeps ~12 backups over 1 year.

## Retention Execution

Retention runs as the **final step** of each backup job, applied **per destination**:

1. Backup upload completes for a destination
2. List all backups for this job in that specific destination
3. Read metadata (check lock status)
4. Apply that destination's retention policy
5. Delete expired backups
6. Repeat for each remaining destination

::: tip Skipped on Failure
Retention is skipped for any destination where the upload failed. This prevents deleting old backups when the new backup didn't arrive.
:::

## Compliance Considerations

### GDPR

- Consider data minimization principles
- Balance retention vs. "right to erasure"
- Document retention policy

### SOX/Financial

- May require 7+ years retention
- Use yearly retention setting
- Lock compliance-critical backups

### HIPAA

- Minimum 6 years retention
- Consider encryption for all backups
- Document access to backups

## Best Practices

### Match Schedule to Retention

| Schedule | Recommended Retention |
| :--- | :--- |
| Hourly | Daily: 24-48 |
| Daily | Daily: 7-14 |
| Weekly | Weekly: 4-8 |
| Monthly | Monthly: 12-24 |

### Start Conservative

Begin with longer retention, then reduce:
1. Storage is cheap
2. You can't recover deleted backups
3. Analyze needs before reducing

### Test Before Production

1. Create test job with short retention
2. Verify deletion works correctly
3. Then apply to production

### Monitor Storage

- Watch storage growth
- Adjust retention if growing too fast
- Use compression to reduce size

## Storage Calculation

Estimate storage needs:

```
Storage = (Backup Size) × (Retained Backups)
```

Example with Smart Retention (Daily=7, Weekly=4, Monthly=12, Yearly=2):
- 100MB daily backup
- ~25 backups retained
- Storage: ~2.5GB

With compression (70% reduction):
- Storage: ~750MB

## Troubleshooting

### Backups Not Being Deleted

1. Verify retention is enabled on job
2. Check if backups are locked
3. View job logs for retention step
4. Ensure backup ran successfully

### Too Many Backups Deleted

1. Check retention settings
2. Verify date/time on backups
3. Lock important backups
4. Increase retention values

### Wrong Backups Deleted

The GFS algorithm keeps the **oldest** backup in each time bucket. This is intentional:
- Weekly: Keeps backup from start of week
- Monthly: Keeps backup from start of month

## API Reference

Retention configuration in job:

```json
{
  "retention": {
    "mode": "SMART",
    "simple": {
      "keepCount": 5
    },
    "smart": {
      "daily": 7,
      "weekly": 4,
      "monthly": 12,
      "yearly": 2
    }
  }
}
```

## Next Steps

- [Creating Jobs](/user-guide/jobs/) - Configure backup jobs
- [Storage Explorer](/user-guide/features/storage-explorer) - Browse and lock backups
- [Encryption](/user-guide/security/encryption) - Secure your backups
