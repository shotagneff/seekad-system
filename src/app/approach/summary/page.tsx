"use client";

// 営業別サマリー（→ /approach/summary）。
//
// 見せるもの:
//   1. 期間の合計（回数・反応・アポ）
//   2. 手段ごとの遷移（テレアポ: コール → 受付突破 → アポ / DM・手紙: 送信 → 返信 → アポ）と段階間の率
//   3. 日ごとの回数の推移（手段の積み上げ棒 + アポの折れ線）
//   4. 人ごとの表（手段別の段階と率）と、人ごとの回数の横棒
//   5. 直近の動き
//
// 「回数」は操作の数（同じ会社に2回電話すれば2）。「段階」は会社数（重複なし）。
// 率はすべて会社数どうしで出す。回数で割ると、同じ会社に何度も電話するほど率が下がって実態とずれる。

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PAGE_MAIN, PAGE_INNER, PANEL, PageHeader, SectionCard } from "@/components/panel";
import { FilterChip, Kpi, Pill, TD, TH, TONE } from "@/components/table-ui";
import { TrendChart, type TrendDatum } from "@/components/trend-chart";
import {
  APPROACH_CHANNELS,
  FUNNEL_LABELS,
  STATUS_TONE,
  SUMMARY_RANGES,
  pct,
  type ApproachAction,
  type ApproachChannel,
  type ApproachStatus,
  type DailyPoint,
  type SalesSummaryRow,
  type SummaryRange,
} from "@/lib/approach-types";
import { Notice, SubNav, readJson, shortDateTime } from "../ui";

const CHANNEL_COLOR: Record<ApproachChannel, string> = {
  テレアポ: "#9e8d70",
  DM: "#8b7bd8",
  手紙: "#6aa9d8",
};

type Payload = {
  people: SalesSummaryRow[];
  overall: SalesSummaryRow;
  daily: DailyPoint[];
  actions: ApproachAction[];
  from: string;
  to: string;
};

export default function SummaryPage() {
  const [range, setRange] = useState<SummaryRange>("today");
  const [person, setPerson] = useState<string>("all");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const json = await readJson<Payload>(await fetch(`/api/approach/summary?range=${range}`, { cache: "no-store" }));
        if (cancelled) return;
        setData(json);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const people = useMemo(() => data?.people ?? [], [data]);
  const focus: SalesSummaryRow | null = useMemo(() => {
    if (!data) return null;
    if (person === "all") return data.overall;
    return people.find((p) => p.actorId === person) ?? data.overall;
  }, [data, people, person]);

  const trendPoints: TrendDatum[] = useMemo(
    () =>
      (data?.daily ?? []).map((d) => ({
        key: d.date,
        label: d.label,
        weekend: d.weekend,
        total: d.total,
        byKind: { ...d.byChannel },
        responded: d.appointments,
      })),
    [data],
  );

  const rangeLabel = SUMMARY_RANGES.find((r) => r.key === range)?.label ?? "";
  const maxApproaches = Math.max(1, ...people.map((p) => p.total.approaches));

  return (
    <main className={PAGE_MAIN}>
      <div className={PAGE_INNER}>
        <PageHeader
          eyebrow="Approach List"
          title="営業別サマリー"
          description="誰が何件動き、どこまで進み、アポが取れたか。率は会社数どうしで出します（反応率＝反応した会社 ÷ 動いた会社）。"
        />
        <SubNav />

        <div className="flex flex-wrap items-center gap-2">
          {SUMMARY_RANGES.map((r) => (
            <FilterChip key={r.key} label={r.label} active={range === r.key} onClick={() => setRange(r.key)} />
          ))}
          <select
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600 outline-none dark:bg-neutral-800 dark:text-neutral-300"
          >
            <option value="all">全員</option>
            {people.map((p) => (
              <option key={p.actorId} value={p.actorId}>
                {p.actorName}
              </option>
            ))}
          </select>
          {data && (
            <span className="text-xs text-neutral-400">
              {data.from === data.to ? data.from : `${data.from} 〜 ${data.to}`}
            </span>
          )}
        </div>

        {error && <Notice tone="error">{error}</Notice>}
        {loading && !data && <Notice>読み込み中…</Notice>}

        {focus && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                label={`${rangeLabel}の回数`}
                value={String(focus.total.approaches)}
                hint={`動いた会社 ${focus.total.funnel[0]} 社`}
              />
              <Kpi
                label="反応した会社"
                value={String(focus.total.funnel[1])}
                hint={`反応率 ${pct(focus.total.funnel[1], focus.total.funnel[0])}`}
              />
              <Kpi
                label="アポ獲得"
                value={String(focus.total.funnel[2])}
                hint={`アポ獲得率 ${pct(focus.total.funnel[2], focus.total.funnel[0])}`}
              />
              <Kpi
                label="動いた人数"
                value={String(people.length)}
                hint={person === "all" ? "アプローチを記録した営業" : focus.actorName}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {APPROACH_CHANNELS.map((ch) => (
                <FunnelCard key={ch} channel={ch} stats={focus.byChannel[ch]} />
              ))}
            </div>
          </>
        )}

        <SectionCard
          title="日ごとの推移"
          description="手段ごとの回数を積み上げ。折れ線はアポ獲得。全員の合計"
          bodyClassName="p-4"
        >
          <TrendChart
            points={trendPoints}
            series={APPROACH_CHANNELS.map((ch) => ({ key: ch, color: CHANNEL_COLOR[ch] }))}
            mode="stack"
            showLine
            lineLabel="アポ獲得"
          />
        </SectionCard>

        <SectionCard title="営業ごとの内訳" description={`${rangeLabel}の件数。回数の多い順`} bodyClassName="p-0">
          {people.length === 0 ? (
            <p className="px-5 py-6 text-sm text-neutral-500">{rangeLabel}はまだアプローチの記録がありません。</p>
          ) : (
            <>
              <div className="space-y-2 px-5 py-4">
                {people.map((p) => (
                  <div key={p.actorId} className="flex items-center gap-3 text-sm">
                    <span className="w-28 shrink-0 truncate font-medium">{p.actorName}</span>
                    <div className="flex h-5 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                      {APPROACH_CHANNELS.map((ch) => {
                        const n = p.byChannel[ch].approaches;
                        if (!n) return null;
                        return (
                          <div
                            key={ch}
                            title={`${ch} ${n}`}
                            style={{ width: `${(n / maxApproaches) * 100}%`, backgroundColor: CHANNEL_COLOR[ch] }}
                          />
                        );
                      })}
                    </div>
                    <span className="w-12 shrink-0 text-right tabular-nums">{p.total.approaches}</span>
                  </div>
                ))}
                <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-neutral-500">
                  {APPROACH_CHANNELS.map((ch) => (
                    <span key={ch} className="inline-flex items-center gap-1">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CHANNEL_COLOR[ch] }} />
                      {ch}
                    </span>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto border-t border-neutral-100 dark:border-neutral-800">
                <table className="min-w-full">
                  <thead className="border-b border-neutral-100 dark:border-neutral-800">
                    <tr>
                      <th className={TH} rowSpan={2}>担当</th>
                      <th className={`${TH} text-right`} rowSpan={2}>回数</th>
                      {APPROACH_CHANNELS.map((ch) => (
                        <th
                          key={ch}
                          className={`${TH} border-l border-neutral-100 text-center dark:border-neutral-800`}
                          colSpan={3}
                          style={{ color: CHANNEL_COLOR[ch] }}
                        >
                          {ch}
                        </th>
                      ))}
                      <th className={`${TH} border-l border-neutral-100 text-right dark:border-neutral-800`} rowSpan={2}>
                        反応率
                      </th>
                      <th className={`${TH} text-right`} rowSpan={2}>
                        アポ獲得率
                      </th>
                    </tr>
                    <tr>
                      {APPROACH_CHANNELS.map((ch) =>
                        FUNNEL_LABELS[ch].map((label, i) => (
                          <th
                            key={`${ch}-${label}`}
                            className={`${TH} text-right ${i === 0 ? "border-l border-neutral-100 dark:border-neutral-800" : ""}`}
                          >
                            {label}
                          </th>
                        )),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {people.map((p) => (
                      <tr key={p.actorId} className={person === p.actorId ? "bg-[#fdf7e7]/70 dark:bg-neutral-800/50" : ""}>
                        <td className={`${TD} font-medium`}>
                          <button onClick={() => setPerson(person === p.actorId ? "all" : p.actorId)} className="hover:text-[#9e8d70]">
                            {p.actorName}
                          </button>
                        </td>
                        <td className={`${TD} text-right font-semibold tabular-nums`}>{p.total.approaches}</td>
                        {APPROACH_CHANNELS.map((ch) =>
                          p.byChannel[ch].funnel.map((n, i) => (
                            <td
                              key={`${ch}-${i}`}
                              className={`${TD} text-right tabular-nums ${i === 0 ? "border-l border-neutral-100 dark:border-neutral-800" : ""} ${
                                i === 2 && n > 0 ? "font-semibold text-yellow-700 dark:text-yellow-300" : "text-neutral-600 dark:text-neutral-300"
                              }`}
                            >
                              {n}
                            </td>
                          )),
                        )}
                        <td className={`${TD} border-l border-neutral-100 text-right tabular-nums dark:border-neutral-800`}>
                          {pct(p.total.funnel[1], p.total.funnel[0])}
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>{pct(p.total.funnel[2], p.total.funnel[0])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </SectionCard>

        <SectionCard title="最近の動き" description="新しいものが上。会社名を押すとそのリストへ移動" bodyClassName="p-0">
          {(data?.actions ?? []).length === 0 ? (
            <p className="px-5 py-6 text-sm text-neutral-500">記録はまだありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="border-b border-neutral-100 dark:border-neutral-800">
                  <tr>
                    <th className={TH}>日時</th>
                    <th className={TH}>担当</th>
                    <th className={TH}>会社</th>
                    <th className={TH}>リスト</th>
                    <th className={TH}>手段</th>
                    <th className={TH}>結果</th>
                    <th className={TH}>メモ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {(data?.actions ?? [])
                    .filter((a) => person === "all" || a.actorId === person)
                    .map((a) => (
                      <tr key={a.id}>
                        <td className={`${TD} text-neutral-500`}>{shortDateTime(a.createdAt)}</td>
                        <td className={`${TD} font-medium`}>{a.actorName}</td>
                        <td className={TD}>
                          <Link href={`/approach/list/${a.listId}`} className="hover:text-[#9e8d70] hover:underline">
                            {a.companyName}
                          </Link>
                        </td>
                        <td className={`${TD} text-neutral-500`}>{a.listLabel}</td>
                        <td className={TD}>
                          <span className="font-medium" style={{ color: CHANNEL_COLOR[a.channel as ApproachChannel] }}>
                            {a.channel}
                          </span>
                        </td>
                        <td className={TD}>
                          <Pill text={a.status} tone={TONE[STATUS_TONE[a.status as ApproachStatus] ?? "gray"]} />
                        </td>
                        <td className={`${TD} max-w-[20rem] truncate text-neutral-500`}>{a.memo ?? ""}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </main>
  );
}

/**
 * 手段1つぶんの遷移カード。
 * 3段の横棒（幅は1段目に対する割合）と、段階の間に遷移率を出す。
 */
function FunnelCard({ channel, stats }: { channel: ApproachChannel; stats: SalesSummaryRow["byChannel"][ApproachChannel] }) {
  const labels = FUNNEL_LABELS[channel];
  const [s1, s2, s3] = stats.funnel;
  const color = CHANNEL_COLOR[channel];
  const width = (n: number) => (s1 ? Math.max(n ? 6 : 0, (n / s1) * 100) : 0);

  return (
    <div className={`${PANEL} p-5`}>
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold" style={{ color }}>
          {channel}
        </h3>
        <span className="text-xs text-neutral-400">{stats.approaches} 回</span>
      </div>
      <div className="mt-4 space-y-1">
        {[s1, s2, s3].map((n, i) => (
          <React.Fragment key={labels[i]}>
            {i > 0 && (
              <div className="flex items-center gap-2 pl-1 text-[11px] text-neutral-400">
                <span>↓</span>
                <span>
                  {labels[i - 1]} → {labels[i]}{" "}
                  <span className="font-semibold text-neutral-600 dark:text-neutral-300">{pct(n, [s1, s2, s3][i - 1])}</span>
                </span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-xs text-neutral-500">{labels[i]}</span>
              <div className="h-6 flex-1 overflow-hidden rounded-md bg-neutral-100 dark:bg-neutral-800">
                <div
                  className="h-full rounded-md transition-[width]"
                  style={{ width: `${width(n)}%`, backgroundColor: color, opacity: 1 - i * 0.25 }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums">{n}</span>
            </div>
          </React.Fragment>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-neutral-400">
        {labels[0]}からアポまで <span className="font-semibold text-neutral-600 dark:text-neutral-300">{pct(s3, s1)}</span>
      </p>
    </div>
  );
}
