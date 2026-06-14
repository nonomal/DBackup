import { LogEntry } from "@/lib/core/logs";

export interface ExportMeta {
  jobName: string;
  type: string;
  status: string;
  startedAt: string;
  endedAt?: string | null;
  triggerType?: string | null;
  triggerLabel?: string | null;
}

function formatUtcTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatUtcDatetime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

function levelPad(level: string): string {
  return level.toUpperCase().padEnd(7);
}

export function formatLogsAsText(logs: LogEntry[], meta: ExportMeta): string {
  const lines: string[] = [];

  lines.push("DBackup Execution Log");
  lines.push("=".repeat(48));
  lines.push(`Job:     ${meta.jobName}`);
  lines.push(`Type:    ${meta.type}`);
  lines.push(`Status:  ${meta.status}`);
  lines.push(`Started: ${formatUtcDatetime(meta.startedAt)}`);
  if (meta.endedAt) {
    lines.push(`Ended:   ${formatUtcDatetime(meta.endedAt)}`);
  }
  if (meta.triggerType) {
    lines.push(`Trigger: ${meta.triggerType}`);
  }
  lines.push("=".repeat(48));

  // Group by stage
  const stageMap = new Map<string, LogEntry[]>();
  for (const entry of logs) {
    const stage = entry.stage ?? "General";
    if (!stageMap.has(stage)) stageMap.set(stage, []);
    stageMap.get(stage)!.push(entry);
  }

  for (const [stage, entries] of stageMap) {
    lines.push("");

    let stageHeader = `[STAGE: ${stage}]`;
    if (entries.length >= 2) {
      const first = new Date(entries[0].timestamp).getTime();
      const last = new Date(entries[entries.length - 1].timestamp).getTime();
      const durationMs = last - first;
      if (!isNaN(durationMs) && durationMs >= 0) {
        stageHeader += ` (${formatDurationMs(durationMs)})`;
      }
    }
    lines.push(stageHeader);

    for (const entry of entries) {
      const ts = formatUtcTimestamp(entry.timestamp);
      const lvl = levelPad(entry.level);
      const durationSuffix = entry.durationMs != null ? ` [${formatDurationMs(entry.durationMs)}]` : "";
      lines.push(`${ts}  ${lvl}  ${entry.message}${durationSuffix}`);
      if (entry.details) {
        lines.push("  [DETAILS]");
        for (const detailLine of entry.details.split("\n")) {
          lines.push(`  ${detailLine}`);
        }
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}

export function generateLogFilename(jobName: string, startedAt: string): string {
  const slug = jobName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  const d = new Date(startedAt);
  if (isNaN(d.getTime())) return `dbackup-${slug}.log`;

  const date = d.toISOString().slice(0, 10);
  const hhmm = `${String(d.getUTCHours()).padStart(2, "0")}-${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return `dbackup-${slug}-${date}-${hhmm}.log`;
}
