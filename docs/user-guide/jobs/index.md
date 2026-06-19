# Backup Jobs

Backup jobs are the core of DBackup. They connect a database source to a storage destination and define when and how backups should run.

## Overview

A job defines:
- **What** to backup (source database)
- **Where** to store it (one or more destinations)
- **When** to run (schedule)
- **How** to process (compression, encryption)
- **How long** to keep (retention per destination)

## Creating a Job

1. Navigate to **Jobs** in the sidebar
2. Click **Create Job**
3. Configure the job settings
4. Save

### Basic Settings

| Setting | Description |
| :--- | :--- |
| **Name** | Descriptive name (e.g., "Daily MySQL Backup") |
| **Source** | Database connection to backup |
| **Destinations** | One or more storage locations for backups (see [Multi-Destination](#multi-destination) below) |
| **Enabled** | Toggle job on/off |
| **Filename Template** | Override the global filename pattern with a per-job naming template (configured in Settings → Templates) |
| **Skip Verification** | Disable post-upload checksum verification for this job (see [Backup Verification](/user-guide/features/backup-verification)) |

### Compression

Reduce backup size significantly:

| Algorithm | Speed | Compression | Best For |
| :--- | :--- | :--- | :--- |
| **None** | Fastest | 0% | Quick backups, already compressed |
| **Gzip** | Fast | 60-70% | General use |
| **Brotli** | Slower | 70-80% | Maximum compression |

::: tip PostgreSQL Native Compression
PostgreSQL jobs have an additional **PostgreSQL Compression** setting that controls native `pg_dump` compression (GZIP, LZ4, ZSTD). See [PostgreSQL → PostgreSQL Compression](/user-guide/sources/postgresql#postgresql-compression).
:::

### Encryption

Protect sensitive data:

1. Create an [Encryption Profile](/user-guide/security/encryption) first
2. Select the profile in job settings
3. Backups are encrypted with AES-256-GCM

### Schedule

Automate backups with cron expressions. See [Scheduling](/user-guide/jobs/scheduling).

### Retention

Automatically clean up old backups. Retention is configured **per destination** - each destination can have its own retention policy. See [Retention Policies](/user-guide/jobs/retention).

### Filename Pattern

Customize the filename of backup files globally in **Settings → General → Backup Filename Pattern**. The pattern supports the following tokens:

| Token | Description | Example |
| :--- | :--- | :--- |
| `{name}` | Job name | `Daily MySQL Backup` |
| `{db_name}` | Database name | `mydb` |
| `yyyy` | 4-digit year | `2026` |
| `MM` | 2-digit month | `05` |
| `dd` | 2-digit day | `03` |
| `HH` | 2-digit hour (24h) | `14` |
| `mm` | 2-digit minute | `30` |
| `ss` | 2-digit second | `00` |

A live preview and clickable token chips are shown in the settings form. The default pattern produces filenames like `JobName_2026-05-03T14-30-00.sql`.

### Notifications

Get alerts when backups complete:

1. Create a [Notification](/user-guide/features/notifications) first
2. Select notification in job settings
3. Choose trigger: Success, Failure, or Both

## Multi-Destination

A job can upload to **multiple storage destinations** simultaneously - ideal for implementing the 3-2-1 backup rule.

### Adding Destinations

1. In the job form, click **Add Destination**
2. Select a storage adapter from the dropdown
3. Repeat to add more destinations
4. Drag to reorder upload priority

### Per-Destination Retention

Each destination has its own retention configuration:
- Expand a destination row to reveal the retention settings
- Choose None, Simple, or Smart (GFS) independently per destination
- Example: keep 30 daily backups locally, but only 12 monthly in S3

### Upload Behavior

- The database dump runs **once** - the resulting file is uploaded to each destination sequentially
- Destinations are processed in priority order (top to bottom)
- If one destination fails, the others still continue
- The same storage adapter cannot be selected twice in one job

### Partial Success

If some destinations succeed and others fail, the execution is marked as **Partial** (see [Job Status](#job-status)).

## Job Actions

### Run Now

Execute the job immediately:
1. Click the **▶ Run** button on the job
2. Monitor progress in real-time
3. View results in History

### Enable/Disable

Toggle the job without deleting:
- Disabled jobs don't run on schedule
- Can still be triggered manually

### Duplicate

Create a copy with same settings:
- Useful for similar backups
- Modify as needed after duplication

### Delete

Remove the job permanently:
- Does **not** delete existing backups
- Schedule is removed

## Job Status

| Status | Description |
| :--- | :--- |
| 🟢 **Active** | Enabled and scheduled |
| ⚪ **Disabled** | Not running on schedule |
| 🔵 **Running** | Currently executing |
| � **Partial** | Some destinations succeeded, others failed |
| �🔴 **Failed** | Last run failed |

## Execution Monitoring

### Live Progress

During execution, view:
- Current step (Initialize → Dump → Upload → Complete)
- File size progress
- Live log output

### Execution History

After completion:
1. Go to **History**
2. View all past executions
3. Check logs for details
4. See success/failure status

## Best Practices

### Naming Convention

Use descriptive names:
- `prod-mysql-daily` - Production MySQL, daily
- `staging-postgres-hourly` - Staging PostgreSQL, hourly
- `mongodb-weekly-archive` - MongoDB weekly archive

### One Source Per Job

For clarity, create separate jobs for:
- Different databases
- Different retention requirements
- Different schedules

### Test Before Scheduling

1. Create job with no schedule
2. Run manually
3. Verify backup in Storage Explorer
4. Test restore
5. Then enable schedule

### Resource Considerations

- Schedule during low-traffic periods
- Avoid overlapping large backups
- Monitor system resources during backup

## Concurrent Execution

By default, one backup runs at a time. Configure concurrency:

1. Go to **Settings** → **System**
2. Set **Max Concurrent Jobs**
3. Higher values = more parallel backups

::: warning Resource Usage
More concurrent jobs = higher CPU/memory/disk usage
:::

## Job Pipeline

When a job runs, it goes through these steps:

```
1. Initialize
   └── Fetch job config
   └── Decrypt credentials
   └── Validate source connection
   └── Resolve all destination adapters

2. Dump
   └── Execute database dump
   └── Apply compression (if enabled)
   └── Apply encryption (if enabled)

3. Upload (Fan-Out)
   └── For each destination (by priority):
       └── Transfer backup file
       └── Create metadata file
       └── Verify checksum (local storage)
   └── Evaluate results → Partial if mixed

4. Completion
   └── Cleanup temp files
   └── Record per-destination results
   └── Update execution status
   └── Send notifications

5. Retention (per destination)
   └── For each destination (successful uploads only):
       └── List existing backups
       └── Apply that destination's retention policy
       └── Delete expired backups
```

## Troubleshooting

### Job Stuck in "Running"

If a job shows running but isn't progressing:
1. Check **History** for the execution
2. View logs for errors
3. The server may have restarted mid-backup
4. Manually cancel if needed

### Backup Too Slow

1. Enable compression (smaller transfer)
2. Schedule during off-peak hours
3. Check network between DBackup and destination
4. Consider faster storage

### Out of Disk Space

Temp files are stored locally during processing:
1. Increase available disk space
2. Enable compression to reduce temp file size
3. Clean up old temp files: `/tmp/dbackup-*`

## Next Steps

- [Scheduling](/user-guide/jobs/scheduling) - Configure when jobs run
- [Retention Policies](/user-guide/jobs/retention) - Automatic cleanup
- [Encryption](/user-guide/security/encryption) - Secure your backups
