"use client";

import { useEffect, useMemo, useState } from "react";
import { WEEKDAY_LABELS, todayJst, isSchedulableMember, type WeeklyRow, type OverrideRow } from "@/lib/attendance-util";
import AttendanceCalendar, { monthStart, shiftMonth } from "@/components/attendance-calendar";

type Member = { id: string; name: string; iconUrl?: string; active: boolean };

const CELL =
  "w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900";

export default function AttendancePage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [weekly, setWeekly] = useState<WeeklyRow[]>([]);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [ovDate, setOvDate] = useState<string>(todayJst());
  const [calMonth, setCalMonth] = useState<string>(todayJst().slice(0, 7));
  // 日別上書きをどの日から読み込んであるか。カレンダーでそれより前の月に移動したら読み直す
  const [loadedFrom, setLoadedFrom] = useState<string>(monthStart(shiftMonth(todayJst().slice(0, 7), -1)));
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [mRes, aRes] = await Promise.all([
          fetch("/api/members", { cache: "no-store" }),
          fetch(`/api/attendance?from=${loadedFrom}`, { cache: "no-store" }),
        ]);
        if (mRes.ok) {
          const m = (await mRes.json()) as Member[];
          setMembers(Array.isArray(m) ? m.filter((x) => x.active && isSchedulableMember(x.name)) : []);
        }
        if (aRes.ok) {
          const a = (await aRes.json()) as { weekly: WeeklyRow[]; overrides: OverrideRow[] };
          setWeekly(a.weekly ?? []);
          setOverrides(a.overrides ?? []);
        }
      } catch (e) {
        console.error("failed to load attendance", e);
      }
    })();
  }, [loadedFrom]);

  const changeMonth = (ym: string) => {
    setCalMonth(ym);
    const from = monthStart(ym);
    if (from < loadedFrom) setLoadedFrom(from);
  };

  const calendarMembers = useMemo(
    () => members.map((m) => ({ id: m.id, name: m.name, iconUrl: m.iconUrl })),
    [members]
  );

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 1200);
  };

  const weeklyValue = (memberId: string, weekday: number): string =>
    weekly.find((w) => w.memberId === memberId && w.weekday === weekday)?.startTime ?? "";

  const saveWeekly = async (memberId: string, weekday: number, startTime: string) => {
    setWeekly((prev) => {
      const rest = prev.filter((w) => !(w.memberId === memberId && w.weekday === weekday));
      return [...rest, { memberId, weekday, startTime: startTime || null }];
    });
    await fetch("/api/attendance", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "weekly", memberId, weekday, startTime }),
    }).catch(() => {});
    flash("保存しました");
  };

  const ovValue = (memberId: string): OverrideRow | undefined =>
    overrides.find((o) => o.memberId === memberId && o.date === ovDate);

  const saveOverride = async (memberId: string, startTime: string, isOff: boolean) => {
    setOverrides((prev) => {
      const rest = prev.filter((o) => !(o.memberId === memberId && o.date === ovDate));
      if (!startTime && !isOff) return rest;
      return [...rest, { memberId, date: ovDate, startTime: startTime || null, isOff }];
    });
    await fetch("/api/attendance", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "override", memberId, date: ovDate, startTime, isOff }),
    }).catch(() => {});
    flash("保存しました");
  };

  const todayWd = useMemo(() => WEEKDAY_LABELS[new Date(`${ovDate}T00:00:00Z`).getUTCDay()], [ovDate]);

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-[var(--foreground)]">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-6 space-y-8">
        {toast && (
          <div className="fixed bottom-5 right-5 z-50 rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white shadow-lg">
            {toast}
          </div>
        )}

        <header className="pb-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">シークアドシステム</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">出勤スケジュール</h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            曜日ごとの基本出勤時刻を設定します。空欄はその曜日は休みです。設定内容はホームの「今日の出勤」に反映されます。
          </p>
        </header>

        {/* 月カレンダー（誰がどの日に出勤するかの一覧） */}
        <section className="rounded-2xl border border-neutral-200 bg-white/90 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/80">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">出勤カレンダー</h2>
          <p className="mt-1 text-[11px] text-neutral-500">
            曜日の基本と日別の変更を合わせた、実際の出勤予定です。日付を押すと下の「日別の変更」の日付が切り替わります。
          </p>
          <div className="mt-3">
            <AttendanceCalendar
              month={calMonth}
              members={calendarMembers}
              weekly={weekly}
              overrides={overrides}
              onMonthChange={changeMonth}
              onSelectDate={(d) => {
                setOvDate(d);
                document.getElementById("daily-override")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              selectedDate={ovDate}
            />
          </div>
        </section>

        {/* 曜日ごとの基本 */}
        <section className="rounded-2xl border border-neutral-200 bg-white/90 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/80">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">曜日ごとの基本出勤時刻</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-neutral-400">
                  <th className="px-2 py-2">メンバー</th>
                  {WEEKDAY_LABELS.map((d, i) => (
                    <th key={d} className={`px-2 py-2 text-center ${i === 0 ? "text-rose-500" : i === 6 ? "text-sky-500" : ""}`}>
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {members.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-2 py-6 text-center text-neutral-400">メンバーがいません</td>
                  </tr>
                )}
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="px-2 py-2 font-medium whitespace-nowrap">{m.name}</td>
                    {WEEKDAY_LABELS.map((_, wd) => (
                      <td key={wd} className="px-1.5 py-1.5">
                        <input
                          type="time"
                          step={60}
                          defaultValue={weeklyValue(m.id, wd)}
                          onBlur={(e) => {
                            if (e.target.value !== weeklyValue(m.id, wd)) saveWeekly(m.id, wd, e.target.value);
                          }}
                          className={CELL}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 日別の上書き */}
        <section id="daily-override" className="scroll-mt-6 rounded-2xl border border-neutral-200 bg-white/90 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/80">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">日別の変更（休み・時間変更）</h2>
              <p className="mt-1 text-[11px] text-neutral-500">この日だけ曜日の設定を上書きします。空欄なら曜日の基本どおり。</p>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
              日付
              <input type="date" value={ovDate} onChange={(e) => setOvDate(e.target.value)} className={`${CELL} w-auto`} />
              <span className="text-[11px] text-neutral-400">（{todayWd}）</span>
            </label>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-neutral-400">
                  <th className="px-2 py-2">メンバー</th>
                  <th className="px-2 py-2">この日の出勤時刻</th>
                  <th className="px-2 py-2 text-center">休み</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {members.map((m) => {
                  const ov = ovValue(m.id);
                  return (
                    <tr key={m.id}>
                      <td className="px-2 py-2 font-medium whitespace-nowrap">{m.name}</td>
                      <td className="px-2 py-1.5 w-40">
                        <input
                          type="time"
                          step={60}
                          defaultValue={ov?.isOff ? "" : ov?.startTime ?? ""}
                          key={`${m.id}-${ovDate}-${ov?.startTime ?? ""}-${ov?.isOff}`}
                          disabled={ov?.isOff}
                          onBlur={(e) => saveOverride(m.id, e.target.value, false)}
                          className={`${CELL} w-36 disabled:opacity-40`}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={ov?.isOff ?? false}
                          onChange={(e) => saveOverride(m.id, "", e.target.checked)}
                          className="h-4 w-4"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
