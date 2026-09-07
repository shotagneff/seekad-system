"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  resolveForDate,
  todayJst,
  WEEKDAY_LABELS,
  isSchedulableMember,
  type WeeklyRow,
  type OverrideRow,
} from "@/lib/attendance-util";
import type { Lead } from "@/lib/sales-types";
import AttendanceCalendar, { monthStart } from "@/components/attendance-calendar";

type Announcement = {
  id: string;
  title: string;
  body: string;
  category?: string;
  linkUrl?: string;
  publishedAt?: string;
  authorMemberId?: string;
  createdAt?: string;
  updatedAt?: string;
};

type Member = {
  id: string;
  name: string;
  team?: string;
  role?: string;
  iconUrl?: string;
  active: boolean;
};

export default function Home() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [weekly, setWeekly] = useState<WeeklyRow[]>([]);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);

  const today = todayJst();
  const [calMonth, setCalMonth] = useState<string>(today.slice(0, 7));
  // 日別上書きをどの日から読み込んであるか。カレンダーでそれより前の月に移動したら読み直す
  const [attendanceFrom, setAttendanceFrom] = useState<string>(monthStart(today.slice(0, 7)));

  const formatAnnouncementDate = (a: Announcement): string => {
    const raw = (a.publishedAt || a.updatedAt || a.createdAt || "").trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString("ja-JP");
  };

  useEffect(() => {
    const loadAnnouncements = async () => {
      try {
        const res = await fetch("/api/announcements", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Announcement[];
        if (!Array.isArray(data)) return;
        setAnnouncements(data);
      } catch (e) {
        console.error("failed to fetch announcements", e);
      }
    };
    void loadAnnouncements();
  }, []);

  useEffect(() => {
    const loadMembers = async () => {
      try {
        const res = await fetch("/api/members", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Member[];
        if (!Array.isArray(data)) return;
        setMembers(data);
      } catch (e) {
        console.error("failed to fetch members", e);
      }
    };
    void loadMembers();
  }, []);

  useEffect(() => {
    const loadSales = async () => {
      try {
        const res = await fetch("/api/sales", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { leads?: Lead[] };
        if (Array.isArray(data.leads)) setLeads(data.leads);
      } catch (e) {
        console.error("failed to fetch sales", e);
      }
    };
    void loadSales();
  }, []);

  useEffect(() => {
    const loadAttendance = async () => {
      try {
        const res = await fetch(`/api/attendance?from=${attendanceFrom}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { weekly?: WeeklyRow[]; overrides?: OverrideRow[] };
        if (Array.isArray(data.weekly)) setWeekly(data.weekly);
        if (Array.isArray(data.overrides)) setOverrides(data.overrides);
      } catch (e) {
        console.error("failed to fetch attendance", e);
      }
    };
    void loadAttendance();
  }, [attendanceFrom]);

  const changeCalMonth = (ym: string) => {
    setCalMonth(ym);
    const from = monthStart(ym);
    if (from < attendanceFrom) setAttendanceFrom(from);
  };

  const schedulableMembers = useMemo(
    () =>
      members
        .filter((m) => m.active && isSchedulableMember(m.name))
        .map((m) => ({ id: m.id, name: m.name, iconUrl: m.iconUrl })),
    [members]
  );

  const membersById = useMemo(() => {
    const map = new Map<string, Member>();
    for (const m of members) map.set(m.id, m);
    return map;
  }, [members]);

  const membersByName = useMemo(() => {
    const map = new Map<string, Member>();
    for (const m of members) map.set(m.name.trim(), m);
    return map;
  }, [members]);

  // 今日のアポイント：次回アクション日が今日のリードを担当ごとにまとめる
  const appointmentGroups = useMemo(() => {
    const todayLeads = leads.filter((l) => l.nextActionOn === today);
    const byOwner = new Map<string, Lead[]>();
    for (const l of todayLeads) {
      const key = l.owner?.trim() || "担当未設定";
      const arr = byOwner.get(key) ?? [];
      arr.push(l);
      byOwner.set(key, arr);
    }
    const timeVal = (l: Lead) => l.nextActionTime || "99:99";
    const groups = Array.from(byOwner.entries()).map(([owner, list]) => {
      const sorted = [...list].sort((a, b) => timeVal(a).localeCompare(timeVal(b)));
      return {
        owner,
        member: membersByName.get(owner),
        list: sorted,
        earliest: timeVal(sorted[0]),
      };
    });
    groups.sort((a, b) => a.earliest.localeCompare(b.earliest));
    return groups;
  }, [leads, today, membersByName]);

  const totalAppointments = useMemo(
    () => appointmentGroups.reduce((n, g) => n + g.list.length, 0),
    [appointmentGroups]
  );

  // 今日の出勤
  const attendanceToday = useMemo(
    () => resolveForDate(schedulableMembers, weekly, overrides, today),
    [schedulableMembers, weekly, overrides, today]
  );

  // 現在時刻（分）。シフト表の「今」の縦ライン用。1分ごとに更新
  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    };
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, []);

  // シフト表の時間軸。出勤開始の最小30分前から、遅くとも22:00までを表示
  const timeline = useMemo(() => {
    if (attendanceToday.length === 0) return null;
    const toMin = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const starts = attendanceToday.map((a) => toMin(a.startTime));
    const minStart = Math.min(...starts);
    const maxStart = Math.max(...starts);
    const axisStart = Math.max(0, Math.floor((minStart - 30) / 60) * 60);
    const axisEnd = Math.min(24 * 60, Math.max(maxStart + 120, 22 * 60));
    const range = Math.max(1, axisEnd - axisStart);
    const pct = (min: number) => ((min - axisStart) / range) * 100;
    const hours: number[] = [];
    for (let h = Math.ceil(axisStart / 60); h <= Math.floor(axisEnd / 60); h++) hours.push(h);
    return { axisStart, axisEnd, pct, hours, toMin };
  }, [attendanceToday]);

  const nowVisible = nowMin !== null && timeline !== null && nowMin >= timeline.axisStart && nowMin <= timeline.axisEnd;

  const todayLabel = useMemo(() => {
    const wd = WEEKDAY_LABELS[new Date(`${today}T00:00:00Z`).getUTCDay()];
    const [, m, d] = today.split("-");
    return `${Number(m)}月${Number(d)}日（${wd}）`;
  }, [today]);

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-[var(--foreground)]">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-6 space-y-8">
        {/* ヘッダー */}
        <header className="pb-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            シークアドシステム
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div className="relative h-9 w-9 overflow-hidden rounded-full bg-[#f2e7d3]">
              <Image src="/images/icons/homeicon.png" alt="ホームアイコン" fill className="object-contain" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">ホーム</h1>
            <span className="ml-1 text-sm font-medium text-neutral-500 dark:text-neutral-400">{todayLabel}</span>
          </div>
        </header>

        {announcements.length > 0 && (
          <section className="pt-0">
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">最新ニュース</h2>
              </div>
              <div className="mt-1 border-t border-neutral-200 dark:border-neutral-800" />
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {announcements.map((a) => {
                  const dateText = formatAnnouncementDate(a);
                  const author = a.authorMemberId ? membersById.get(a.authorMemberId) : undefined;
                  const Wrapper: any = a.linkUrl ? "a" : "div";
                  const wrapperProps = a.linkUrl
                    ? { href: a.linkUrl, target: "_blank", rel: "noreferrer" }
                    : {};
                  return (
                    <Wrapper key={a.id} {...wrapperProps} className="block py-3">
                      <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:gap-6">
                        <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 tabular-nums">
                          {dateText}
                          {author && (
                            <div className="mt-1 flex items-center gap-2 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                              {author.iconUrl ? (
                                <Image
                                  src={author.iconUrl}
                                  alt=""
                                  width={18}
                                  height={18}
                                  className="h-[18px] w-[18px] rounded-full object-cover"
                                />
                              ) : (
                                <div className="h-[18px] w-[18px] rounded-full bg-neutral-200 dark:bg-neutral-800" />
                              )}
                              <span>{author.name}</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-semibold leading-snug text-neutral-900 dark:text-neutral-50">
                            {a.title}
                          </div>
                          <div className="mt-1 line-clamp-2 text-[12px] leading-snug text-neutral-600 dark:text-neutral-300">
                            {a.body}
                          </div>
                          {a.linkUrl && (
                            <div className="mt-2 text-[11px] font-semibold text-neutral-700 underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-500 dark:text-neutral-200 dark:decoration-neutral-700 dark:hover:decoration-neutral-500">
                              詳細を見る ↗
                            </div>
                          )}
                        </div>
                      </div>
                    </Wrapper>
                  );
                })}
              </div>
              <div className="border-b border-neutral-200 dark:border-neutral-800" />
            </div>
          </section>
        )}

        {/* 今日のアポイント */}
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">今日のアポイント</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">
                本日 合計 <span className="text-base font-bold text-[#9e8d70]">{totalAppointments}</span> 件
              </span>
              <Link
                href="/appointments"
                className="text-[11px] font-semibold text-neutral-500 underline decoration-neutral-300 underline-offset-4 hover:text-neutral-800 dark:text-neutral-400"
              >
                アポ獲得管理へ ↗
              </Link>
            </div>
          </div>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            「アポ獲得管理」で次回アクション日を今日に設定したリードを、担当ごとにまとめています。
          </p>

          {totalAppointments === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-neutral-300 bg-white/60 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/40">
              今日のアポイントはまだ登録されていません。
            </div>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {appointmentGroups.map((g) => (
                <div
                  key={g.owner}
                  className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/80"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-2.5 dark:border-neutral-800">
                    <div className="flex items-center gap-2">
                      {g.member?.iconUrl ? (
                        <Image
                          src={g.member.iconUrl}
                          alt=""
                          width={28}
                          height={28}
                          className="h-7 w-7 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f2e7d3] text-xs font-bold text-[#9e8d70]">
                          {g.owner.slice(0, 1)}
                        </div>
                      )}
                      <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{g.owner}</span>
                    </div>
                    <span className="rounded-full bg-[#9e8d70] px-2 py-0.5 text-xs font-bold text-white">
                      {g.list.length}件
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {g.list.map((l) => (
                      <li key={l.id} className="flex items-start gap-2 text-sm">
                        <span className="mt-[1px] w-12 shrink-0 font-bold tabular-nums text-neutral-800 dark:text-neutral-100">
                          {l.nextActionTime ? l.nextActionTime.slice(0, 5) : "未定"}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-neutral-800 dark:text-neutral-100">
                            {l.company || "（会社名未設定）"}
                          </span>
                          {l.nextAction && (
                            <span className="block truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                              {l.nextAction}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 今日の出勤 */}
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">今日の出勤</h2>
            <Link
              href="/attendance"
              className="text-[11px] font-semibold text-neutral-500 underline decoration-neutral-300 underline-offset-4 hover:text-neutral-800 dark:text-neutral-400"
            >
              出勤スケジュールを設定 ↗
            </Link>
          </div>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            今日出勤するメンバーを、出勤開始の時間帯を棒で表示しています（右にいくほど後の時間）。
          </p>

          {attendanceToday.length === 0 || !timeline ? (
            <div className="mt-3 rounded-2xl border border-dashed border-neutral-300 bg-white/60 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/40">
              今日の出勤予定がありません。
              <Link href="/attendance" className="ml-1 font-semibold text-[#9e8d70] underline underline-offset-2">
                出勤スケジュールを設定
              </Link>
              してください。
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-neutral-200 bg-white/90 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/80">
              {/* 時間目盛り */}
              <div className="flex items-end gap-2">
                <div className="w-24 shrink-0 sm:w-32" />
                <div className="relative h-4 flex-1 text-[10px] text-neutral-400">
                  {timeline.hours
                    .filter((h) => h % 2 === 0)
                    .map((h) => (
                      <span
                        key={h}
                        className="absolute -translate-x-1/2 tabular-nums"
                        style={{ left: `${timeline.pct(h * 60)}%` }}
                      >
                        {h}:00
                      </span>
                    ))}
                  {nowVisible && (
                    <span
                      className="absolute -translate-x-1/2 font-bold text-rose-500"
                      style={{ left: `${timeline.pct(nowMin as number)}%` }}
                    >
                      今
                    </span>
                  )}
                </div>
              </div>

              {/* 各メンバーの出勤バー */}
              <div className="mt-1 space-y-1.5">
                {attendanceToday.map((a) => {
                  const s = timeline.toMin(a.startTime);
                  return (
                    <div key={a.memberId} className="flex items-center gap-2">
                      <div className="flex w-24 shrink-0 items-center sm:w-32">
                        <span className="truncate text-sm font-bold text-neutral-900 dark:text-neutral-50">{a.name}</span>
                      </div>
                      <div className="relative h-8 flex-1 overflow-hidden rounded-md bg-neutral-100 dark:bg-neutral-800/50">
                        {/* 1時間ごとのグリッド線 */}
                        {timeline.hours.map((h) => (
                          <div
                            key={h}
                            className="absolute inset-y-0 w-px bg-white/70 dark:bg-black/20"
                            style={{ left: `${timeline.pct(h * 60)}%` }}
                          />
                        ))}
                        {/* 現在時刻 */}
                        {nowVisible && (
                          <div
                            className="absolute inset-y-0 z-10 w-0.5 bg-rose-400/80"
                            style={{ left: `${timeline.pct(nowMin as number)}%` }}
                          />
                        )}
                        {/* 出勤バー（開始時刻から。終了は未管理なので右へフェード） */}
                        <div
                          className="absolute inset-y-1 flex items-center rounded pl-2"
                          style={{
                            left: `${timeline.pct(s)}%`,
                            right: "2px",
                            background:
                              "linear-gradient(to right, rgba(158,141,112,0.95), rgba(158,141,112,0.2))",
                          }}
                        >
                          <span className="text-[11px] font-bold text-white drop-shadow-sm">{a.startTime}〜</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* 出勤カレンダー（月） */}
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">出勤カレンダー</h2>
            <Link
              href="/attendance"
              className="text-[11px] font-semibold text-neutral-500 underline decoration-neutral-300 underline-offset-4 hover:text-neutral-800 dark:text-neutral-400"
            >
              出勤スケジュールを設定 ↗
            </Link>
          </div>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            誰がどの日に出勤するかの月間予定です。曜日の基本と日別の変更を合わせた結果を表示しています。
          </p>
          <div className="mt-3 rounded-2xl border border-neutral-200 bg-white/90 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/80">
            <AttendanceCalendar
              month={calMonth}
              members={schedulableMembers}
              weekly={weekly}
              overrides={overrides}
              onMonthChange={changeCalMonth}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
