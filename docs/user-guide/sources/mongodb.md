# MongoDB

Configure MongoDB databases for backup.

## Supported Versions

| Versions |
| :--- |
| 4.x, 5.x, 6.x, 7.x, 8.x |

DBackup uses `mongodump` from MongoDB Database Tools.

## Connection Modes

| Mode | Description |
| :--- | :--- |
| **Direct** | DBackup connects via TCP and runs `mongodump` locally |
| **SSH** | DBackup connects via SSH and runs `mongodump` on the remote host |

## Configuration

::: info Credential Profiles
A [Credential Profile](/user-guide/security/credential-profiles) is **optional** for MongoDB — instances without authentication can connect without one. If your MongoDB requires login credentials, create a `USERNAME_PASSWORD` profile in **Settings → Vault → Credentials** first. SSH mode requires an `SSH_KEY` profile.
:::

| Field | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| **Connection Mode** | Direct (TCP) or SSH | `Direct` | ✅ |
| **Connection URI** | Full MongoDB URI (overrides other settings) | - | ❌ |
| **Host** | Database server hostname | `localhost` | ✅ |
| **Port** | MongoDB port | `27017` | ✅ |
| **Primary Credential** | `USERNAME_PASSWORD` credential profile (username + password) | - | ❌ |
| **Auth Database** | Authentication database | `admin` | ❌ |
| **Database** | Database name(s) to backup | All databases | ❌ |
| **Additional Options** | Extra `mongodump` flags | - | ❌ |

### SSH Mode Fields

These fields appear when **Connection Mode** is set to **SSH**:

| Field | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| **SSH Host** | SSH server hostname or IP | - | ✅ |
| **SSH Port** | SSH server port | `22` | ❌ |
| **SSH Credential** | `SSH_KEY` credential profile (username + key or password) | - | ✅ |

## Prerequisites

### Direct Mode

The DBackup server needs `mongodump`, `mongorestore`, and `mongosh` CLI tools installed.

**Docker**: Already included in the DBackup image.

### SSH Mode

The **remote SSH server** must have the following tools installed:

```bash
# Required for backup
mongodump

# Required for restore
mongorestore

# Required for connection testing and database listing
mongosh
```

**Install on the remote host:**

<details>
<summary>Debian/Ubuntu - MongoDB Database Tools + mongosh</summary>

Add the official MongoDB repository first:
```bash
# Import MongoDB GPG key
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | \
  gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg

# Add repository (Debian 12 / Ubuntu 24.04 example)
echo "deb [signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg] https://repo.mongodb.org/apt/debian bookworm/mongodb-org/8.0 main" | \
  tee /etc/apt/sources.list.d/mongodb-org-8.0.list

# Install tools
apt-get update
apt-get install mongodb-database-tools mongodb-mongosh
```

See the official docs for other distro versions:
- [MongoDB Database Tools](https://www.mongodb.com/docs/database-tools/installation/installation-linux/)
- [mongosh](https://www.mongodb.com/docs/mongodb-shell/install/)

</details>

```bash
# macOS
brew install mongodb-database-tools
brew install mongosh
```

::: danger Important
In SSH mode, the MongoDB tools must be installed on the remote server. DBackup executes them remotely via SSH and streams the output back.
:::

## Connection Methods

### Using Connection URI (Recommended)

For complex setups (replica sets, Atlas, SRV records):

```
mongodb+srv://user:password@cluster.mongodb.net/mydb?retryWrites=true
```

### Using Host/Port

For simple setups:
- **Host**: `mongodb.example.com`
- **Port**: `27017`
- **User**: `backup_user`
- **Password**: `your_password`
- **Auth Database**: `admin`

## Setting Up a Backup User

Create a dedicated user with the `backup` role:

```javascript
// Connect to admin database
use admin

// Create backup user
db.createUser({
  user: "dbackup",
  pwd: "secure_password_here",
  roles: [
    { role: "backup", db: "admin" }
  ]
})

// For restore operations, also add:
db.grantRolesToUser("dbackup", [
  { role: "restore", db: "admin" }
])
```

::: tip MongoDB Atlas
For Atlas clusters, create a user with "Backup Admin" role in the Atlas UI.
:::

## Backup Process

### Direct Mode

DBackup uses `mongodump` which creates a binary BSON dump:

- Consistent point-in-time backup
- Includes indexes and collection options
- Supports oplog for replica set backups

### SSH Mode

In SSH mode, DBackup:

1. Connects to the remote server via SSH
2. Checks that `mongodump` is available on the remote host
3. Executes `mongodump --archive --gzip` remotely
4. Streams the archive output back over the SSH connection
5. Applies additional encryption locally
6. Uploads to the configured storage destination

::: tip Host in SSH Mode
The **Host** field refers to the MongoDB hostname **as seen from the SSH server**. If MongoDB runs on the same machine as the SSH server, use `127.0.0.1` or `localhost`. Connection URIs also work in SSH mode.
:::

### Output Format

The backup creates a directory structure:
```
dump/
├── admin/
│   └── system.version.bson
├── mydb/
│   ├── users.bson
│   ├── users.metadata.json
│   └── orders.bson
```

This is archived and optionally compressed.

## Multi-Database Backups

When backing up multiple databases, DBackup creates a **TAR archive** containing individual `mongodump --archive` files:

```
backup.tar
├── manifest.json      # Metadata about contained databases
├── database1.archive  # Individual mongodump archive per database
├── database2.archive
└── ...
```

### Features

- **Selective Restore**: Choose which databases to restore from a multi-DB backup
- **Database Renaming**: Uses `--nsFrom/--nsTo` to restore to different database names
- **True Multi-DB**: Unlike previous versions, you can now backup any combination of databases (not just "all or one")

::: warning Breaking Change (v0.9.1)
Multi-DB backups created before v0.9.1 cannot be restored with newer versions.
:::

## Additional Options Examples

```bash
# Backup specific collection
--collection=users

# Exclude collections
--excludeCollection=logs --excludeCollection=sessions

# Include oplog (for point-in-time recovery)
--oplog

# Query filter (backup subset of data)
--query='{"createdAt":{"$gte":{"$date":"2024-01-01T00:00:00Z"}}}'

# Read preference for replica sets
--readPreference=secondary

# Parallel collections
--numParallelCollections=4
```

## Replica Set Configuration

For replica sets, use the connection URI:

```
mongodb://user:pass@rs1.example.com:27017,rs2.example.com:27017,rs3.example.com:27017/mydb?replicaSet=myRS
```

Or set read preference:
```bash
# Additional Options
--readPreference=secondaryPreferred
```

## Sharded Cluster Configuration

For sharded clusters, connect to a `mongos` router:

```
mongodb://user:pass@mongos1.example.com:27017,mongos2.example.com:27017/admin
```

::: warning Sharded Cluster Backup
For production sharded clusters, consider using MongoDB's native backup solutions (Cloud Backup, Ops Manager) for consistent snapshots.
:::

## Authentication

### SCRAM Authentication (Default)

Works automatically when you provide user/password.

### x.509 Certificate

```bash
# Additional Options
--ssl --sslCAFile=/path/to/ca.pem --sslPEMKeyFile=/path/to/client.pem
```

### LDAP Authentication

```
mongodb://ldapuser:ldappass@host:27017/mydb?authMechanism=PLAIN&authSource=$external
```

## Troubleshooting

### Authentication Failed

```
authentication failed
```

**Solutions**:
1. Verify username/password
2. Check `authSource` is correct (usually `admin`)
3. Ensure user has required roles

### Connection Timeout

```
no reachable servers
```

**Solutions**:
1. Check network connectivity
2. Verify hostname/port
3. Check firewall rules
4. For SRV records, ensure DNS is accessible

### Insufficient Permissions

```
not authorized on admin to execute command
```

**Solution**: Grant backup role:
```javascript
db.grantRolesToUser("dbackup", [{ role: "backup", db: "admin" }])
```

### SSH: Binary Not Found

```
Required binary not found on remote server. Tried: mongodump
```

**Solution:** Install MongoDB Database Tools on the remote server. See [MongoDB Database Tools Installation](https://www.mongodb.com/docs/database-tools/installation/).

### SSH: Connection Refused

**Solution:**
1. Verify SSH is running: `systemctl status sshd`
2. Check SSH port and firewall rules
3. Test manually: `ssh user@host`

## Restore

To restore a MongoDB backup:

1. Go to **Storage Explorer**
2. Find your backup file
3. Click **Restore**
4. Select target database configuration
5. Optionally map database names
6. Confirm and monitor progress

### Restore Options

- **Drop existing data**: Clean restore
- **Preserve existing data**: Merge/upsert mode
- **Specific collections**: Restore selected collections only

## Next Steps

- [Create a Backup Job](/user-guide/jobs/)
- [Enable Encryption](/user-guide/security/encryption)
- [Configure Retention](/user-guide/jobs/retention)
