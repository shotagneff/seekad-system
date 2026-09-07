"use client";

// 出勤カレンダー（月表示）。誰がどの日に出勤するかを一目で見るための共通部品。
// 出勤スケジュール画面（/attendance）とホーム（/）の両方から使う。
//
// 表示ルール:
//   ・各日のメンバーは resolveForDate で確定（日別上書き > 曜日デフォルト）
//   ・日別上書きで「時間変更」した人はゴールド枠、「休み」にした人は赤の取り消し線
//   ・今日はゴールドの枠で強調。選択中の日（onSelectDate がある場合）は塗りで強調
//   ・データに触れない表示専用部品。データ取得と月移動時の再取得は呼び出し側が行う

import { useMemo } from "react";
import {
  resolveForDate,
  todayJst,
  WEEKDAY_LABELS,
  type WeeklyRow,
  type OverrideRow,
} from "@/lib/attendance-util";

export type CalendarMember = { id: string; name: string };

/** 'YYYY-MM' の月初日 'YYYY-MM-01' */
export function monthStart(ym: string): string {
  return `${ym}-01`;
}

/** 'YYYY-MM' を n か月ずらす */
export function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 'YYYY-MM' の表示ラベル（2026年9月） */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${y}年${m}月`;
}

/** その月の日付一覧 'YYYY-MM-DD' */
function daysOfMonth(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) out.push(`${ym}-${String(d).padStart(2, "0")}`);
  return out;
}

/** 表示名を短くする（姓だけ）。「平賀　翔大」→「平賀」 */
function shortName(name: string): string {
  const s = name.trim().split(/[\s　]+/)[0];
  return s || name;
}

type Props = {
  month: string; // 'YYYY-MM'
  members: CalendarMember[];
  weekly: WeeklyRow[];
  overrides: OverrideRow[];
  onMonthChange?: (ym: string) => void;
  /** 指定すると日付セルがクリックできるようになる（日別変更の日付を選ぶ用途） */
  onSelectDate?: (date: string) => void;
  selectedDate?: string;
  /** コンパクト表示（ホーム用）。セルを低くし時刻を省く */
  compact?: boolean;
};

export default function AttendanceCalendar({
  month,
  members,
  weekly,
  overrides,
  onMonthChange,
  onSelectDate,
  selectedDate,
  compact = false,
}: Props) {
  const today = todayJst();

  const cells = useMemo(() => {
    const days = daysOfMonth(month);
    const ovByDate = new Map<string, Map<string, OverrideRow>>();
    for (const o of overrides) {
      if (!o.date.startsWith(month)) continue;
      const m = ovByDate.get(o.date) ?? new Map<string, OverrideRow>();
      m.set(o.memberId, o);
      ovByDate.set(o.date, m);
    }
    return days.map((date) => {
      const working = resolveForDate(members, weekly, overrides, date);
      const ovMap = ovByDate.get(date);
      const offByOverride = members.filter((m) => ovMap?.get(m.id)?.isOff);
      return {
        date,
        day: Number(date.slice(-2)),
        weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
        working: working.map((w) => ({ ...w, changed: Boolean(ovMap?.get(w.memberId)) })),
        offByOverride,
      };
    });
  }, [month, members, weekly, overrides]);

  // 月初の曜日ぶんだけ空セルを入れて、日曜始まりで並べる
  const leading = cells.length > 0 ? cells[0].weekday : 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMonthChange?.(shiftMonth(month, -1))}
            disabled={!onMonthChange}
            aria-label="前の月"
            className="rounded-full px-2.5 py-1 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            ‹
          </button>
          <span className="min-w-[7rem] text-center text-sm font-bold text-neutral-900 dark:text-neutral-50">
            {monthLabel(month)}
          </span>
          <button
            type="button"
            onClick={() => onMonthChange?.(shiftMonth(month, 1))}
            disabled={!onMonthChange}
            aria-label="次の月"
            className="rounded-full px-2.5 py-1 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            ›
          </button>
          {onMonthChange && month !== today.slice(0, 7) && (
            <button
              type="button"
              onClick={() => onMonthChange(today.slice(0, 7))}
              className="ml-1 rounded-full border border-neutral-200 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              今月へ
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-neutral-500 dark:text-neutral-400">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#9e8d70]/20 ring-1 ring-[#9e8d70]" />
            時間変更
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-50 ring-1 ring-rose-300 dark:bg-rose-950/40" />
            休み（日別）
          </span>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <div className="min-w-[40rem]">
          <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            {WEEKDAY_LABELS.map((d, i) => (
              <div key={d} className={`py-1 ${i === 0 ? "text-rose-500" : i === 6 ? "text-sky-500" : ""}`}>
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: leading }).map((_, i) => (
              <div key={`lead-${i}`} />
            ))}
            {cells.map((c) => {
              const isToday = c.date === today;
              const isSelected = selectedDate === c.date;
              const isPast = c.date < today;
              const clickable = Boolean(onSelectDate);
              const dayColor = c.weekday === 0 ? "text-rose-500" : c.weekday === 6 ? "text-sky-500" : "text-neutral-700 dark:text-neutral-200";
              const Cell: "button" | "div" = clickable ? "button" : "div";
              return (
                <Cell
                  key={c.date}
                  type={clickable ? "button" : undefined}
                  onClick={clickable ? () => onSelectDate?.(c.date) : undefined}
                  className={[
                    "flex flex-col rounded-lg border p-1.5 text-left transition-colors",
                    compact ? "min-h-[4.5rem]" : "min-h-[6.5rem]",
                    isSelected
                      ? "border-[#9e8d70] bg-[#f2e7d3]/60 dark:bg-[#9e8d70]/20"
                      : isToday
                        ? "border-[#9e8d70] bg-white dark:bg-neutral-900"
                        : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900/60",
                    isPast && !isSelected ? "opacity-60" : "",
                    clickable ? "hover:border-[#9e8d70] cursor-pointer" : "",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold tabular-nums ${dayColor} ${
                        isToday ? "rounded-full bg-[#9e8d70] px-1.5 text-white" : ""
                      }`}
                    >
                      {c.day}
                    </span>
                    {c.working.length > 0 && (
                      <span className="text-[10px] font-semibold text-neutral-400">{c.working.length}人</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-col gap-0.5">
                    {c.working.map((w) => (
                      <span
                        key={w.memberId}
                        title={`${w.name} ${w.startTime}〜`}
                        className={[
                          "flex items-center justify-between gap-1 rounded px-1 text-[11px] leading-5",
                          w.changed
                            ? "bg-[#9e8d70]/15 ring-1 ring-inset ring-[#9e8d70] text-neutral-900 dark:text-neutral-50"
                            : "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100",
                        ].join(" ")}
                      >
                        <span className="truncate font-semibold">{shortName(w.name)}</span>
                        {!compact && <span className="shrink-0 tabular-nums text-neutral-500 dark:text-neutral-400">{w.startTime}</span>}
                      </span>
                    ))}
                    {c.offByOverride.map((m) => (
                      <span
                        key={`off-${m.id}`}
                        title={`${m.name} 休み`}
                        className="flex items-center justify-between gap-1 rounded bg-rose-50 px-1 text-[11px] leading-5 text-rose-600 ring-1 ring-inset ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900"
                      >
                        <span className="truncate font-semibold line-through">{shortName(m.name)}</span>
                        {!compact && <span className="shrink-0">休</span>}
                      </span>
                    ))}
                    {c.working.length === 0 && c.offByOverride.length === 0 && (
                      <span className="text-[10px] text-neutral-300 dark:text-neutral-600">—</span>
                    )}
                  </div>
                </Cell>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
