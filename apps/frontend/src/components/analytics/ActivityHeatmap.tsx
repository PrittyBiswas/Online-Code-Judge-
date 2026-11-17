import React, { useState } from 'react';
import { Calendar } from 'lucide-react';
import type { ActivityHeatmapDay } from '../../types';

interface ActivityHeatmapProps {
  activity: ActivityHeatmapDay[];
}

export const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({ activity }) => {
  const [hoveredDay, setHoveredDay] = useState<{
    date: string;
    count: number;
    acceptedCount: number;
    x: number;
    y: number;
  } | null>(null);

  // Map of date string -> data
  const activityMap = new Map<string, ActivityHeatmapDay>(activity.map((a) => [a.date, a]));

  // Generate 52 weeks ending today
  const today = new Date();
  const days: { dateStr: string; dayOfWeek: number; count: number; acceptedCount: number }[] = [];

  // Start from 52 weeks ago, aligned to previous Sunday
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 364);
  const startDay = startDate.getDay();
  startDate.setDate(startDate.getDate() - startDay);

  const cur = new Date(startDate);
  while (cur <= today) {
    const dateStr = cur.toISOString().slice(0, 10);
    const act = activityMap.get(dateStr);
    days.push({
      dateStr,
      dayOfWeek: cur.getDay(),
      count: act?.count ?? 0,
      acceptedCount: act?.acceptedCount ?? 0,
    });
    cur.setDate(cur.getDate() + 1);
  }

  // Group into weeks (columns)
  const weeks: (typeof days)[] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  const getColorClass = (count: number) => {
    if (count === 0) return 'bg-slate-800/80 hover:ring-1 hover:ring-slate-500';
    if (count <= 2)
      return 'bg-emerald-900 border border-emerald-700/50 hover:ring-1 hover:ring-emerald-400';
    if (count <= 5) return 'bg-emerald-700 hover:ring-1 hover:ring-emerald-300';
    if (count <= 9) return 'bg-emerald-500 hover:ring-1 hover:ring-emerald-200';
    return 'bg-emerald-400 hover:ring-1 hover:ring-white';
  };

  const totalSubmissionsInPeriod = activity.reduce((s, a) => s + a.count, 0);
  const activeDaysCount = activity.filter((a) => a.count > 0).length;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/15 text-emerald-400">
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-200">Activity Calendar</h3>
            <p className="text-xs text-slate-400">
              {totalSubmissionsInPeriod} submissions across {activeDaysCount} active days in the
              last year
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 self-end text-xs text-slate-400 sm:self-auto">
          <span>Less</span>
          <div className="h-2.5 w-2.5 rounded-sm bg-slate-800/80" />
          <div className="h-2.5 w-2.5 rounded-sm border border-emerald-700/50 bg-emerald-900" />
          <div className="h-2.5 w-2.5 rounded-sm bg-emerald-700" />
          <div className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
          <div className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
          <span>More</span>
        </div>
      </div>

      {/* Heatmap container */}
      <div className="relative mt-6 overflow-x-auto pb-2">
        <div className="inline-flex min-w-[700px] flex-col gap-1">
          <div className="flex gap-1">
            {weeks.map((week, wIndex) => (
              <div key={wIndex} className="flex flex-col gap-1">
                {week.map((d) => (
                  <div
                    key={d.dateStr}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredDay({
                        date: d.dateStr,
                        count: d.count,
                        acceptedCount: d.acceptedCount,
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                      });
                    }}
                    onMouseLeave={() => setHoveredDay(null)}
                    className={`h-3 w-3 cursor-pointer rounded-sm transition-colors ${getColorClass(d.count)}`}
                    aria-label={`${d.dateStr}: ${d.count} submissions`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Floating tooltip */}
        {hoveredDay && (
          <div
            className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs shadow-xl"
            style={{ left: `${hoveredDay.x}px`, top: `${hoveredDay.y - 8}px` }}
          >
            <div className="font-semibold text-slate-200">{hoveredDay.date}</div>
            <div className="text-slate-400">
              {hoveredDay.count === 0 ? (
                'No submissions'
              ) : (
                <>
                  <span className="font-medium text-emerald-400">{hoveredDay.count}</span>{' '}
                  submission
                  {hoveredDay.count > 1 ? 's' : ''} ({hoveredDay.acceptedCount} accepted)
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
