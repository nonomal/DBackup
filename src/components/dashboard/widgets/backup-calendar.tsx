"use client";

import { useMemo, useState, useTransition } from "react";
import { format, parseISO, startOfWeek, addDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CalendarDayData } from "@/services/dashboard-service";

interface BackupCalendarProps {
  data: CalendarDayData[];
  availableYears: number[];
}

function getCellColor(day: CalendarDayData | undefined): string {
  if (!day || day.total === 0) return "bg-muted";
  if (day.failed > 0) return "bg-red-400 dark:bg-red-600";
  if (day.partial > 0) return "bg-yellow-400 dark:bg-yellow-500";
  if (day.completed >= 4) return "bg-green-600 dark:bg-green-500";
  if (day.completed >= 2) return "bg-green-400 dark:bg-green-600";
  return "bg-green-200 dark:bg-green-800";
}

function buildTooltipLabel(day: CalendarDayData | undefined, date: Date): string {
  const dateStr = format(date, "EEEE, MMM d, yyyy");
  if (!day || day.total === 0) return `${dateStr} - No backups`;
  const parts: string[] = [];
  if (day.completed > 0) parts.push(`${day.completed} successful`);
  if (day.failed > 0) parts.push(`${day.failed} failed`);
  if (day.partial > 0) parts.push(`${day.partial} partial`);
  return `${dateStr} - ${parts.join(", ")}`;
}

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

function buildGrid(data: CalendarDayData[]): {
  weeks: Date[][];
  monthLabels: { weekIndex: number; label: string }[];
} {
  if (data.length === 0) return { weeks: [], monthLabels: [] };

  const firstDate = parseISO(data[0].date);
  const lastDate = parseISO(data[data.length - 1].date);

  const gridStart = startOfWeek(firstDate, { weekStartsOn: 1 });

  const allDays: Date[] = [];
  let cursor = gridStart;
  while (cursor <= lastDate) {
    allDays.push(cursor);
    cursor = addDays(cursor, 1);
  }

  const weeks: Date[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  const seenMonths = new Set<string>();
  const monthLabels: { weekIndex: number; label: string }[] = [];
  for (let wi = 0; wi < weeks.length; wi++) {
    for (const day of weeks[wi]) {
      if (day.getDate() === 1) {
        const monthKey = format(day, "yyyy-MM");
        if (!seenMonths.has(monthKey)) {
          seenMonths.add(monthKey);
          monthLabels.push({ weekIndex: wi, label: format(day, "MMM") });
        }
      }
    }
  }

  return { weeks, monthLabels };
}

export function BackupCalendar({ data: initialData, availableYears }: BackupCalendarProps) {
  // "last" = rolling 12 months; a year string = specific calendar year
  const [selectedValue, setSelectedValue] = useState<string>("last");
  const [calendarData, setCalendarData] = useState<CalendarDayData[]>(initialData);
  const [isPending, startTransition] = useTransition();

  function handleYearChange(value: string) {
    setSelectedValue(value);
    startTransition(async () => {
      const url = value === "last"
        ? "/api/dashboard/calendar"
        : `/api/dashboard/calendar?year=${value}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setCalendarData(json.data);
      }
    });
  }

  const dayMap = useMemo(() => {
    const m = new Map<string, CalendarDayData>();
    for (const d of calendarData) m.set(d.date, d);
    return m;
  }, [calendarData]);

  const { weeks, monthLabels } = useMemo(() => buildGrid(calendarData), [calendarData]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Backup Calendar</CardTitle>
        <Select value={selectedValue} onValueChange={handleYearChange} disabled={isPending}>
          <SelectTrigger className="w-36 h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="last" className="text-xs">Last 12 months</SelectItem>
            {[...availableYears].reverse().map((y) => (
              <SelectItem key={y} value={String(y)} className="text-xs">
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {weeks.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            No backup data{selectedValue !== "last" ? ` for ${selectedValue}` : ""}.
          </div>
        ) : (
          <TooltipProvider delayDuration={100}>
            <div className={`overflow-x-auto pb-2 transition-opacity duration-150 ${isPending ? "opacity-50" : "opacity-100"}`}>
              <div className="flex gap-1" style={{ minWidth: `${weeks.length * 14 + 28}px` }}>
                {/* Day-of-week labels */}
                <div className="flex shrink-0 flex-col gap-0.5 pt-5">
                  {DAY_LABELS.map((label, i) => (
                    <div key={i} className="flex h-3 w-6 items-center justify-end pr-1">
                      <span className="text-[9px] leading-none text-muted-foreground">{label}</span>
                    </div>
                  ))}
                </div>

                {/* Grid columns */}
                <div className="flex flex-col">
                  {/* Month labels */}
                  <div className="relative mb-1 h-4" style={{ width: `${weeks.length * 14}px` }}>
                    {monthLabels.map(({ weekIndex, label }) => (
                      <span
                        key={label + weekIndex}
                        className="absolute text-[10px] leading-none text-muted-foreground"
                        style={{ left: `${weekIndex * 14}px` }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>

                  {/* Week columns */}
                  <div className="flex gap-0.5">
                    {weeks.map((week, wi) => (
                      <div key={wi} className="flex flex-col gap-0.5">
                        {week.map((day, di) => {
                          const key = format(day, "yyyy-MM-dd");
                          const entry = dayMap.get(key);
                          return (
                            <Tooltip key={di}>
                              <TooltipTrigger asChild>
                                <div className={`h-3 w-3 rounded-[2px] cursor-default ${getCellColor(entry)}`} />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                {buildTooltipLabel(entry, day)}
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded-[2px] bg-muted" />
                <span>None</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded-[2px] bg-green-200 dark:bg-green-800" />
                <span>1</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded-[2px] bg-green-400 dark:bg-green-600" />
                <span>2-3</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded-[2px] bg-green-600 dark:bg-green-500" />
                <span>4+</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded-[2px] bg-yellow-400 dark:bg-yellow-500" />
                <span>Partial</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded-[2px] bg-red-400 dark:bg-red-600" />
                <span>Failed</span>
              </div>
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}
