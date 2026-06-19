# Roadmap

This page outlines planned features and improvements for DBackup. Features are subject to change based on community feedback and priorities.



## 🚀 Planned Features

### Restic Storage Backend
- Support Restic as a storage destination for database backups
- Leverage Restic's block-level deduplication to minimize storage consumption (e.g. a 10 GB database growing by 100 MB/day needs ~10.9 GB instead of 104.5 GB with full dumps)
- Combined with `--rsyncable` gzip compression for even better deduplication ratios
- Requires a different backup and restore architecture compared to file-based storage adapters: separate repository management, backup browsing, and retention handling via Restic's own policies
- ([#68](https://github.com/Skyfay/DBackup/issues/68))

### Runner Resilience
- **Retry Logic**: Exponential backoff for transient errors (network timeouts, storage hiccups)
- **Dead Letter Queue**: Move repeatedly failing jobs to a separate status for investigation

### Encryption Key Rotation
- Mechanism to rotate the `ENCRYPTION_KEY` without downtime
- Re-encrypt all stored secrets (DB passwords, SSO client secrets) with the new key
- Rotation guide in documentation

### User Invite Flow
- Email-based user invitations
- Force password change on first login
- Integration with SMTP notification adapter

### Backup Tags & Annotations
- Manually tag backups (e.g., "pre-migration", "before-upgrade")
- Pin backups to protect them from automatic retention policy deletion
- Filter and search by tags in Storage Explorer

### Backup Anomaly Detection
- Alert if backup size deviates significantly from previous runs
- Periodic "test restore" as a scheduled task

### Stream-based Backup Pipeline (Large DB Mode)
- Opt-in mode that pipes the database dump directly to storage without writing to `/tmp` first
- Eliminates local disk space requirements for large databases (100 GB+)
- Parallel upload to multiple destinations via "Tee" stream logic
- Inline checksum and metadata computation via Transform streams
- Primarily aimed at environments with limited local storage (small VMs, Raspberry Pi, low-disk VPS)
- ([#76](https://github.com/Skyfay/DBackup/issues/76))



## 📊 Dashboard & Monitoring

### Backup Calendar View
- Visual overview of when backups ran (similar to GitHub contribution graph)
- Color-coded status (success, failed, skipped)

### Prometheus Metrics Endpoint
- Expose `/metrics` endpoint for Prometheus scraping
- Metrics: backup count, duration, size, success rate, queue depth
- Grafana dashboard template



## 🧪 Testing & Quality

### End-to-End Test Suite
- Playwright or Cypress tests for critical user flows
- Login → Create job → Run backup → Restore → Verify
- Run in CI pipeline



## 🛠 Database Management & Playground

### Backup Drift Detection
- Compare current database state with last backup timestamp
- Show changes since last backup (new tables, size growth, dropped objects)
- Alert when databases have drifted significantly from their last backup

### Server Health Dashboard
- Display server uptime, active connections, running queries, replication status
- Per-adapter health metrics (MySQL: `SHOW STATUS`, PostgreSQL: `pg_stat_activity`)
- Pre-backup health check indicator

### Direct SQL Execution
- Connect directly to configured database sources
- Execute custom SQL queries from the web UI (read-only by default)
- Query result visualization with export to CSV/JSON
- Write mode behind separate permission (`SOURCES.QUERY_WRITE`)

### Query Library
- Pre-built templates for common tasks (user management, table maintenance)
- Quick-action buttons in the UI

### User & Privileges Viewer
- Read-only view of database users and their permissions
- Verify backup user has sufficient privileges
- Security audit helper

### Storage Trend Graph
- Historical database size over time (derived from backup metadata)
- Growth rate visualization for capacity planning



## 🎨 Nice-to-Have

### Internationalization (i18n)
- Multi-language UI support
- Community-contributed translations

### Mobile Responsive UI
- Optimized layouts for tablet and mobile devices
- Status monitoring on the go

### Backup Size Limits & Alerts
- Warning when backups are unexpectedly large or small
- Configurable thresholds per job

### Dark Mode Refinement
- Systematic review of all components for dark mode consistency
- High-contrast accessibility mode



## ✅ Completed

For a full list of completed features, see the [Changelog](/changelog).

### v2.4.0
- ✅ Database Explorer with table browser, schema inspection, row counts, and drill-down data viewer (server-side pagination, full-text search, deep-link URLs)

### v1.0.1
- ✅ Full OpenAPI 3.1 spec with interactive Scalar API reference at `/docs/api` and [api.dbackup.app](https://api.dbackup.app)

### v1.0.0
- ✅ Automatic database migrations (Prisma migrate on startup)
- ✅ Startup recovery (stale execution detection, temp file cleanup, queue re-init)
- ✅ Partial failure handling for multi-DB backups
- ✅ Configurable rate limiting (per-category, adjustable via Settings UI)
- ✅ Quick Setup Wizard (guided first-run experience)
- ✅ Self-service profile editing
- ✅ Backup integrity checks (SHA-256 checksums, scheduled verification)
- ✅ Disaster recovery documentation (Recovery Kit)
- ✅ Upgrade guide for v1.0.0 (config backup/restore)
- ✅ Audit log pagination with database indices
- ✅ Stress testing scripts for MySQL, PostgreSQL, MongoDB, MSSQL

### v0.9.5 – v0.9.9
- ✅ Interactive dashboard with charts and analytics (v0.9.5)
- ✅ SHA-256 checksum verification with integrity check system (v0.9.5)
- ✅ Storage usage analytics and per-destination breakdown (v0.9.5)
- ✅ Smart type filters for sources, destinations, and notifications (v0.9.5)
- ✅ Rsync, Google Drive, Dropbox & OneDrive storage adapters (v0.9.6)
- ✅ Notification system overhaul with event-based routing (v0.9.6)
- ✅ API keys with webhook triggers (v0.9.7)
- ✅ Graceful shutdown with backup-safe SIGTERM handling (v0.9.7)
- ✅ Robust health check endpoint (v0.9.7)
- ✅ Notification adapters: Slack, Teams, Gotify, ntfy, Telegram, Twilio SMS, Generic Webhook (v0.9.8)
- ✅ Storage alerts and notification logs (v0.9.9)

### Earlier Versions
- ✅ Multi-database support (MySQL, PostgreSQL, MongoDB, SQLite, MSSQL, Redis)
- ✅ AES-256-GCM backup encryption with Vault
- ✅ GZIP and Brotli compression
- ✅ S3, SFTP, Local, WebDAV, SMB, FTP/FTPS storage adapters
- ✅ Discord and Email notifications
- ✅ Cron-based scheduling with GFS retention
- ✅ RBAC permission system
- ✅ SSO/OIDC authentication (Authentik, PocketID, Generic)
- ✅ TOTP and Passkey 2FA
- ✅ Live backup progress monitoring
- ✅ System configuration backup & restore
- ✅ Audit logging
- ✅ Centralized logging system with custom error classes
- ✅ wget/curl download links & token-based public downloads
- ✅ Redis database support with restore wizard
- ✅ Type-safe adapter configurations
- ✅ User preferences system
- ✅ PostgreSQL TAR architecture with per-DB custom format dumps
- ✅ Microsoft SQL Server support with Azure SQL Edge compatibility



## 💡 Feature Requests

Have an idea for a new feature? Open an issue on [GitHub](https://github.com/Skyfay/DBackup/issues).
