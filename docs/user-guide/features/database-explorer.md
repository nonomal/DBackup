# Database Explorer

Browse live database schemas and data directly from the DBackup UI without a separate database client.

## Overview

The Database Explorer connects to your configured database sources and lets you:

- View all databases on a server with size and table counts
- Browse tables and their row counts
- Inspect table data (read-only)
- See the server version and version history

## Required Permissions

| Permission | What it grants |
| :--- | :--- |
| `sources:view` | Access the Explorer page and see the source list |
| `sources:read` | Browse databases, tables, and data |

Users with only `sources:view` see the Explorer page but cannot browse databases or data. The **Databases** tab is hidden until `sources:read` is granted.

## Accessing the Explorer

1. Click **Explorer** in the sidebar
2. Select a database source from the dropdown
3. DBackup connects live to the source and lists available databases
4. Click a database to expand its tables
5. Click a table to view its data

The selected source, database, and table are reflected in the URL — you can bookmark or share a direct link to any view.

## Tabs

### General

Shows server-level information:
- Database engine and version
- Server hostname and port
- Version history — a timeline of detected version changes (tracked by the `UPDATE_DB_VERSIONS` system task)

### Databases

Lists all databases with:
- Database name
- Total size (if reported by the engine)
- Table count

Click a database to open the table list. Click a table to view its rows.

## Limitations

- **Read-only** — no queries, no writes, no schema changes
- **Not available for Redis** — Redis uses a key-value model without tables
- **SSH-mode sources** — table browsing may be slower due to the SSH relay
- Data is fetched live on demand — large tables may take a moment to load

## Troubleshooting

### No databases shown

The source user may lack permission to list databases. Grant the `SHOW DATABASES` (MySQL) or equivalent privilege. See the individual [source guides](/user-guide/sources/) for minimum required permissions.

### "Browse" tab not visible

Your user account lacks the `sources:read` permission. Ask an administrator to update your group's permissions in **Users → Groups**.

### Connection error on page load

The source may be offline. Check the health status on the **Sources** page or view the [Health Check](/user-guide/features/backup-verification) history for the source.

## Next Steps

- [Database Sources](/user-guide/sources/) - Configure and manage database connections
- [Groups & Permissions](/user-guide/admin/permissions) - Assign `sources:read` to groups
- [Health Checks](/user-guide/features/backup-verification) - Monitor source connectivity
