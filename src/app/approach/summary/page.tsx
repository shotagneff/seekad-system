"use client";

// 営業別サマリー（→ /approach/summary）。
//
// 誰が今日・今週・今月に何件アプローチし、どれだけ反応があり、アポが取れたか。
// 「アプローチ1件」= 状況を未対応以外に変えた操作1回。同じ会社に2回電話すれば2件。

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { PAGE_MAIN, PAGE_INNER, PageHeader, SectionCard } from "@/components/panel";
import { FilterChip, Kpi, Pill, TD, TH, TONE } from "@/components/table-ui";
import {
  APPROACH_CHANNELS,
  STATUS_TONE,
  SUMMARY_RANGES,
  pct,
  type ApproachAction,
  type SalesSummaryRow,
  type SummaryRange,
} from "@/lib/approach-types";
import { Notice, SubNav, readJson, shortDateTime } from "../ui";

const CHANNELS = APPROACH_CHANNELS.filter((c) => c !== "未対応");

export default function SummaryPage() {
  const [range, setRange] = useState<SummaryRange>("today");
  const [rows, setRows] = useState<SalesSummaryRow[]>([]);
  const [actions, setActions] = useState<ApproachAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const json = await readJson<{ rows: SalesSummaryRow[]; actions: ApproachAction[] }>(
          await fetch(`/api/approach/summary?range=${range}`, { cache: "no-store" }),
        );
        if (cancelled) return;
        setRows(json.rows ?? []);
        setActions(json.actions ?? []);
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

  const total = rows.reduce(
    (acc, r) => ({
      approaches: acc.approaches + r.approaches,
      responded: acc.responded + r.responded,
      appointments: acc.appointments + r.appointments,
    }),
    { approaches: 0, responded: 0, appointments: 0 },
  );

  const rangeLabel = SUMMARY_RANGES.find((r) => r.key === range)?.label ?? "";

  return (
    <main className={PAGE_MAIN}>
      <div className={PAGE_INNER}>
        <PageHeader
          eyebrow="Approach List"
          title="営業別サマリー"
          description="誰が何件アプローチし、どれだけ反応があり、アポが取れたか。反応率＝受付突破・返信あり・アポ獲得 ÷ アプローチ数。"
        />
        <SubNav />

        <div className="flex flex-wrap gap-2">
          {SUMMARY_RANGES.map((r) => (
            <FilterChip key={r.key} label={r.label} active={range === r.key} onClick={() => setRange(r.key)} />
          ))}
        </div>

        {error && <Notice tone="error">{error}</Notice>}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label={`${rangeLabel}のアプローチ`} value={String(total.approaches)} hint="全員の合計" />
          <Kpi label="反応あり" value={String(total.responded)} hint={`反応率 ${pct(total.responded, total.approaches)}`} />
          <Kpi label="アポ獲得" value={String(total.appointments)} hint={`アポ獲得率 ${pct(total.appointments, total.approaches)}`} />
          <Kpi label="動いた人数" value={String(rows.length)} hint="アプローチを記録した営業" />
        </div>

        <SectionCard title="営業ごとの内訳" description={`${rangeLabel}の件数。アプローチ数の多い順`} bodyClassName="p-0">
          {loading ? (
            <p className="px-5 py-6 text-sm text-neutral-500">読み込み中…</p>
          ) : rows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-neutral-500">{rangeLabel}はまだアプローチの記録がありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="border-b border-neutral-100 dark:border-neutral-800">
                  <tr>
                    <th className={TH}>担当</th>
                    <th className={`${TH} text-right`}>アプローチ</th>
                    {CHANNELS.map((c) => (
                      <th key={c} className={`${TH} text-right`}>
                        {c}
                      </th>
                    ))}
                    <th className={`${TH} text-right`}>反応</th>
                    <th className={`${TH} text-right`}>反応率</th>
                    <th className={`${TH} text-right`}>アポ</th>
                    <th className={`${TH} text-right`}>アポ獲得率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {rows.map((r) => (
                    <tr key={r.actorId}>
                      <td className={`${TD} font-medium`}>{r.actorName}</td>
                      <td className={`${TD} text-right font-semibold tabular-nums`}>{r.approaches}</td>
                      {CHANNELS.map((c) => (
                        <td key={c} className={`${TD} text-right tabular-nums text-neutral-500`}>
                          {r.byChannel?.[c] ?? 0}
                        </td>
                      ))}
                      <td className={`${TD} text-right tabular-nums`}>{r.responded}</td>
                      <td className={`${TD} text-right tabular-nums`}>{pct(r.responded, r.approaches)}</td>
                      <td className={`${TD} text-right tabular-nums font-semibold text-yellow-700 dark:text-yellow-300`}>
                        {r.appointments}
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>{pct(r.appointments, r.approaches)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="最近の動き" description="新しいものが上。会社名を押すとそのリストへ移動" bodyClassName="p-0">
          {actions.length === 0 ? (
            <p className="px-5 py-6 text-sm text-neutral-500">記録はまだありません。</p>
          ) : (
            <TableFrameless>
              <table className="min-w-full">
                <thead className="border-b border-neutral-100 dark:border-neutral-800">
                  <tr>
                    <th className={TH}>日時</th>
                    <th className={TH}>担当</th>
                    <th className={TH}>会社</th>
                    <th className={TH}>リスト</th>
                    <th className={TH}>手段</th>
                    <th className={TH}>状況</th>
                    <th className={TH}>メモ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {actions.map((a) => (
                    <tr key={a.id}>
                      <td className={`${TD} text-neutral-500`}>{shortDateTime(a.createdAt)}</td>
                      <td className={`${TD} font-medium`}>{a.actorName}</td>
                      <td className={TD}>
                        <Link href={`/approach/list/${a.listId}`} className="hover:text-[#9e8d70] hover:underline">
                          {a.companyName}
                        </Link>
                      </td>
                      <td className={`${TD} text-neutral-500`}>{a.listLabel}</td>
                      <td className={TD}>{a.channel}</td>
                      <td className={TD}>
                        <Pill text={a.status} tone={TONE[STATUS_TONE[a.status] ?? "gray"]} />
                      </td>
                      <td className={`${TD} max-w-[20rem] truncate text-neutral-500`}>{a.memo ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableFrameless>
          )}
        </SectionCard>
      </div>
    </main>
  );
}

/** SectionCard の中に置くので枠は要らない。横スクロールだけ付ける */
function TableFrameless({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}
