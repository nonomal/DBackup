# Integrity Check System

The integrity check system performs periodic full verification of stored backup files by comparing checksums recorded at upload time against the current file content. It detects silent data corruption or accidental deletion.

**Location**: `src/services/backup/integrity-service.ts`

## Overview

After every backup upload, `verification-service.ts` records SHA-256 and MD5 checksums in a `.meta.json` sidecar file alongside the backup. The integrity check system reads those checksums later and re-verifies the stored file — catching any corruption that occurred after the upload completed.

The check runs as the `INTEGRITY_CHECK` system task (weekly, Sunday at 4 AM, disabled by default). It can also be triggered manually from Settings - System Tasks.

## Scan Modes

The service supports two mutually exclusive scan modes, controlled by the `integrity.scanMode` system setting:

| Mode | Setting value | Behavior |
|------|-------------|----------|
| **Jobs** (default) | `"jobs"` or unset | Only verifies files that belong to at least one enabled backup job |
| **Destinations** | `"destinations"` | Full storage scan: lists every file in every storage destination, regardless of job association |

**Jobs mode** is more targeted and faster. It deduplicates across destinations — if two jobs share the same destination, that destination is only listed once.

**Destinations mode** is comprehensive. It catches orphaned backups (files that exist in storage but are no longer linked to any job) and is better suited for auditing entire storage volumes.

## Filters

Three optional filters narrow the set of files checked:

| SystemSetting key | Type | Description |
|-------------------|------|-------------|
| `integrity.skipPassed` | `"true"` / `"false"` | Skip files that have already passed verification (reduces run time) |
| `integrity.maxAgeDays` | numeric string | Skip files older than N days (`0` = no limit) |
| `integrity.maxFileSizeMb` | numeric string | Skip files larger than N MB (`0` = no limit) |

## Result Shape

`runFullIntegrityCheck()` returns an `IntegrityCheckResult`:

```typescript
export interface IntegrityCheckResult {
  totalFiles: number;  // Total backup files found (after filters)
  verified: number;    // Files where a checksum comparison was performed
  passed: number;      // Checksums matched
  failed: number;      // Checksums did not match (corruption detected)
  skipped: number;     // Files skipped (already passed, no metadata, etc.)
  errors: Array<{
    file: string;        // Filename
    destination: string; // Storage destination name
    expected: string;    // Checksum from .meta.json
    actual: string;      // Checksum computed from current file content
  }>;
}
```

A file can be `skipped` for several reasons: it was already verified and `skipPassed` is enabled, no `.meta.json` was found, no checksum is stored in the metadata, or the download failed during verification.

## Progress Callbacks

The service accepts optional `IntegrityProgressCallbacks` for live UI updates:

```typescript
export interface IntegrityProgressCallbacks {
  onLog: (message: string, level?: "info" | "success" | "warning" | "error", details?: string) => void;
  onStage: (stage: string) => void;
  onFileProgress: (done: number, total: number, currentFile?: string) => void;
}
```

Progress is reported in two stages: `SCANNING` (collecting the file list) and `VERIFYING_CHECKSUMS` (checking each file).

## How It Works

1. Reads filter and mode settings from `SystemSetting`
2. **Scanning phase**: Collects all `WorkItem` entries (one per backup file per destination) according to the configured scan mode. `.meta.json` sidecar files are excluded automatically.
3. **Verification phase**: Calls `verificationService.verifyFile()` for each item. This either uses a native adapter checksum API (S3, Google Drive, OneDrive) or downloads the file to recompute checksums locally.
4. Categorizes each result as `passed`, `failed`, or `skipped`.
5. Returns the aggregated `IntegrityCheckResult`.

Jobs mode also respects a per-job `skipVerification` flag — if set on a job, all its files are skipped and logged.

## System Task Integration

The integrity check is registered as the `INTEGRITY_CHECK` system task:

| Property | Value |
|----------|-------|
| Default schedule | Weekly, Sunday at 4 AM (`0 4 * * 0`) |
| Enabled by default | No |
| Manual trigger | Settings - System Tasks |
| Notification event | `INTEGRITY_CHECK_FAILURE` (fires when `failed > 0`) |

Enable it in Settings - System Tasks. When failures are detected, an `INTEGRITY_CHECK_FAILURE` notification is dispatched through the configured notification channels.

## Skipping Verification per Destination

Individual storage destinations can opt out of integrity checks entirely. Set `skipVerification: true` in the destination's metadata. When this flag is present, the destination is skipped in both scan modes with a log message.

## Related

- [Post-Upload Verification](/developer-guide/advanced/encryption) - how checksums are recorded at upload time
- [System Tasks](/developer-guide/core/services) - task runner infrastructure
- [Storage Alerts](/developer-guide/core/storage-alerts) - proactive storage monitoring
