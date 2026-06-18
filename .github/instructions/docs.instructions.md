---
applyTo: "docs/**/*.md"
---

# Wiki / Documentation Guidelines

## Language

- **Content language**: English
- **Tone**: Clear, concise, practical - write for self-hosters and sysadmins
- **Avoid filler**: No marketing fluff, no restating the obvious

## Unified Adapter Guide Structure

All adapter guides (database sources, storage destinations, notification channels) MUST follow this section order. Omit a section only if it genuinely doesn't apply to that adapter.

### Template

```markdown
# Adapter Name

One-sentence description of what this adapter does.

## Supported Versions (databases only)

Version table.

## Prerequisites (if needed)

CLI tools, external accounts, or setup steps required BEFORE configuring in DBackup.

## Configuration

Single table with ALL fields:

| Field | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| **Field Name** | What it does | `default` | ✅ / ❌ |

## Setup Guide

Numbered steps to configure this adapter in DBackup.
Include external setup (e.g., "Create Discord webhook") as sub-steps.

## How It Works (optional, only if non-obvious)

Brief explanation of the backup/upload/notification process.

## Troubleshooting

3–5 most common issues with solutions. Use this format:

### Problem Title

\`\`\`
Error message or symptom
\`\`\`

**Solution:** Concrete fix.

## Next Steps

2–3 links to related pages (encryption, retention, restore, etc.).
```

### Rules

1. **One config table** - Do NOT split into "Basic Settings" and "Advanced Settings". One table, all fields.
2. **Required column** - Every config table must have a "Required" column (✅ / ❌).
3. **Consistent field names** - Use the exact label shown in the DBackup UI.
4. **Provider examples as collapsible** - External service setup (Gmail, MinIO, Synology, etc.) goes in `<details>` blocks:
   ```markdown
   <details>
   <summary>Gmail SMTP Setup</summary>

   Content here...

   </details>
   ```
5. **No comparison tables in individual guides** - Comparisons belong in the category index page only.
6. **No "Best Practices" laundry lists** - Integrate tips as `::: tip` callouts where relevant, or omit.
7. **Troubleshooting limit** - Max 5 entries per guide. Focus on errors users actually hit.
8. **Line budget** - Aim for 100–200 lines per adapter guide. Exceeding 250 is a warning sign.

## Index Pages (Overview)

Each category (sources, destinations, notifications) has an index page with:
1. A table of all adapters with links
2. A "Choosing" section (brief prose or bullet comparison - not full paragraphs per adapter)
3. Common setup steps (if shared across adapters)
4. Links to individual adapter guides

## VitePress Features

Use these VitePress containers for callouts:

```markdown
::: tip Title
Helpful advice.
:::

::: warning Title
Important caveat.
:::

::: danger Title
Critical warning.
:::

::: info Title
Additional context.
:::
```

Use `::: code-group` for multi-language/multi-variant code blocks.

Use `<details>/<summary>` for optional/collapsible content (provider examples, advanced configs).

## Content Principles

- **Verify claims against code** - Every config field, default value, and feature claim must match `src/lib/adapters/definitions/` (split into `database.ts`, `storage.ts`, `notification.ts`) and the adapter implementation.
- **Don't document external products** - Link to official docs instead of explaining how Gmail, AWS IAM, or Nginx work.
- **One source of truth** - Don't repeat information across pages. Link instead.
- **Screenshots are optional** - Only include if the UI flow is genuinely confusing.
