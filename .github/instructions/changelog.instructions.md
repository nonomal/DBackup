---
applyTo: "**/changelog.md"
---

# Changelog Format Instructions

## Entry Format

Every changelog entry uses a **bold component prefix** followed by a description:

```
- **component**: Description of the change (1-2 sentences max) ([#N](url))
```

- **component**: Short, lowercase area/adapter name (e.g., `auth`, `MSSQL`, `dashboard`, `ui`, `backup`, `storage`, `SSO`, `Redis`). Must be a **name**, never a sentence or description.
- **Description**: One sentence - as short as possible while still making sense. Two sentences only if absolutely necessary. Write **what** was done, not why or how.
- **Issue links**: Always at the **end** of the entry in the format `([#N](url))`. Never embed issue numbers in the component name.

## Section Headings

Entries are grouped under emoji-prefixed `###` headings within each version. Only include sections that have entries. Sections must appear in **exactly this order** - never rearrange:

| Order | Section | Use for |
|---|---|---|
| 1 | `### ✨ Features` | New features, new adapters, new capabilities |
| 2 | `### 🐛 Bug Fixes` | Bug fixes |
| 3 | `### 🔒 Security` | Security-related changes |
| 4 | `### 🎨 Improvements` | Performance, UX, quality improvements |
| 5 | `### 🔄 Changed` | Changed behavior (non-breaking) |
| 6 | `### 🗑️ Removed` | Removed features, deprecated code |
| 7 | `### 📝 Documentation` | Documentation changes |
| 8 | `### 🧪 Tests` | Tests added or changed |
| 9 | `### 🔧 CI/CD` | CI/CD pipeline changes |
| 10 | `### 🐳 Docker` | Docker image info (always last) |

Do **not** invent new sections. Use exactly these headings.

## Version Header Format

```markdown
## vX.Y.Z - Short Title
*Released: Month Day, Year*
```

Use `*Release: In Progress*` for unreleased versions.

## Breaking Changes

Breaking changes get a blockquote with ⚠️ directly below the release date (before any sections):

```markdown
> ⚠️ **Breaking:** Description of what breaks and migration steps.
```

## Docker Section

Every version that has a published Docker image includes a `### 🐳 Docker` section as the **last section**:

```markdown
### 🐳 Docker

- **Image**: `skyfay/dbackup:vX.Y.Z`
- **Also tagged as**: `latest`, `v1` (or `beta` for pre-releases)
- **Platforms**: linux/amd64, linux/arm64
```

Tag rules:
- **Stable releases** (no suffix): `latest` + major version tag (e.g., `v1`)
- **Beta releases** (`-beta` suffix): `beta`
- **Dev releases** (`-dev` suffix): `dev`

## Rules

1. **Grouped sections** - Entries are organized under `###` section headings, not a flat list.
2. **Bold component prefix** - Every entry starts with `**component**:` to identify the affected area.
3. **One line per entry** - Each entry is a single bullet point. One sentence, max two if necessary. Keep it as short as possible.
4. **What, not why/how** - Describe what changed, not why it was needed or how it works. No file paths, function names, or technical internals.
5. **Chronological order** - Newest version at the top.
6. **No separators** - Do not add `---` between versions. VitePress renders them automatically.
7. **Docker section last** - `### 🐳 Docker` is always the final section in a version block.
8. **Omit empty sections** - Only include section headings that have at least one entry.

## Example

```markdown
## v1.2.0 - Cloud Storage & Notifications
*Released: April 15, 2026*

### ✨ Features

- **Google Drive**: Added OAuth 2.0 integration with folder browser
- **email**: Added multi-recipient support via tag input

### 🔒 Security

- **OAuth**: Refresh tokens are now encrypted at rest

### 🎨 Improvements

- **dashboard**: Reduced storage statistics page load time

### 🐛 Bug Fixes

- **auth**: Fixed blank page shown to SSO users after login redirect

### 📝 Documentation

- **wiki**: Added per-provider setup guides for cloud storage adapters

### 🐳 Docker

- **Image**: `skyfay/dbackup:v1.2.0`
- **Also tagged as**: `latest`, `v1`
- **Platforms**: linux/amd64, linux/arm64
```
