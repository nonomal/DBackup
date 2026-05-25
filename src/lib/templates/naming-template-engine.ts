import { formatInTimeZone } from "date-fns-tz";
import { format } from "date-fns";

export interface NamingTokenInfo {
  token: string;
  description: string;
}

export interface NamingTokenGroup {
  group: string;
  tokens: NamingTokenInfo[];
}

export const NAMING_TOKEN_GROUPS: NamingTokenGroup[] = [
  {
    group: "Job Info",
    tokens: [
      { token: "{job_name}", description: "Job name (sanitized)" },
      { token: "{db_name}", description: "Database name(s)" },
    ],
  },
  {
    group: "Date",
    tokens: [
      { token: "yyyy", description: "4-digit year (2026)" },
      { token: "MM", description: "2-digit month (01-12)" },
      { token: "MMM", description: "Short month name (Jan)" },
      { token: "MMMM", description: "Full month name (January)" },
      { token: "dd", description: "2-digit day (01-31)" },
    ],
  },
  {
    group: "Time",
    tokens: [
      { token: "HH", description: "Hour, 24h (00-23)" },
      { token: "mm", description: "Minute (00-59)" },
      { token: "ss", description: "Second (00-59)" },
    ],
  },
];

function applyDateTokens(
  pattern: string,
  date: Date,
  timezone?: string
): string {
  const fmt = (token: string) =>
    timezone ? formatInTimeZone(date, timezone, token) : format(date, token);

  // Process longer tokens first to avoid partial matches (MMMM before MMM before MM)
  return pattern
    .replace(/MMMM/g, fmt("MMMM"))
    .replace(/MMM/g, fmt("MMM"))
    .replace(/yyyy/g, fmt("yyyy"))
    .replace(/MM/g, fmt("MM"))
    .replace(/dd/g, fmt("dd"))
    .replace(/HH/g, fmt("HH"))
    .replace(/mm/g, fmt("mm"))
    .replace(/ss/g, fmt("ss"));
}

export function applyNamingPattern(
  pattern: string,
  jobName: string,
  dbName: string,
  date: Date,
  timezone: string = "UTC"
): string {
  // Apply date tokens first so that date-like substrings in job/db names
  // (e.g. 'mm' in 'Immich') are never misinterpreted as format tokens.
  const withDates = applyDateTokens(pattern, date, timezone);

  return withDates
    .replace(/{job_name}/g, jobName)
    .replace(/{db_name}/g, dbName);
}

export function previewPattern(pattern: string): string {
  try {
    const withDates = applyDateTokens(pattern, new Date());

    return withDates
      .replace(/{job_name}/g, "JobName")
      .replace(/{db_name}/g, "mydb");
  } catch {
    return "Invalid pattern";
  }
}
