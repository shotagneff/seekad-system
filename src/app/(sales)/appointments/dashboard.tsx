"use client";

// アポ獲得管理のダッシュボード。
//
// 反響リードのダッシュボードと同じ見た目（KPI＋推移グラフ＋内訳）で、
// 「毎日 何件アポが取れて / 何件案件化して / 何件成約したか」を見せる。
//   アポ獲得 … リード登録   案件化 … 案件作成   成約 … 受注
// 件数は 日別・週次・月次 で切り替え、率（案件化率・成約率）は月ごとに折れ線で見せる。
import { useMemo, useState } from "react";
import {
  OPEN_DEAL_PHASES,
  appointmentByOwner,
  appointmentDailyTrend,
  appointmentMonthlyTrend,
  appointmentRateTrend,
  appointmentWeeklyTrend,
  type SalesData,
  type SalesOwnerBreakdown,
} from "@/lib/sales-types";
import { Card, Kpi } from "@/app/leads/ui";
import { TrendChart } from "@/components/trend-chart";

// 反響リードと同じ3色を使う
const SERIES = [
  { key: "アポ獲得", color: "#9e8d70" },
  { key: "案件化", color: "#1d6f80" },
  { key: "成約", color: "#94532f" },
];

// 率は「何を何で割ったか」が凡例だけで分かるようにする
const RATE_SERIES = [
  { key: "案件化率", color: "#1d6f80" },
  { key: "成約率", color: "#94532f" },
  { key: "アポ→成約率", color: "#9e8d70" },
];

const PERIODS = ["日別", "週次", "月次"] as const;
type Period = (typeof PERIODS)[number];

export function AppointmentDashboard({ data }: { data: SalesData }) {
  const [period, setPeriod] = useState<Period>("日別");

  const daily = useMemo(() => appointmentDailyTrend(data, 14), [data]);
  const weekly = useMemo(() => appointmentWeeklyTrend(data), [data]);
  const monthly = useMemo(() => appointmentMonthlyTrend(data, 12), [data]);
  const monthlyRates = useMemo(() => appointmentRateTrend(monthly), [monthly]);
  const byOwner = useMemo(() => appointmentByOwner(data), [data]);
  const trendPoints = period === "日別" ? daily : period === "週次" ? weekly : monthly;

  const totalAppo = data.leads.length;
  const dealt = data.deals.length;
  const won = data.deals.filter((d) => d.phase === "受注").length;
  const winRate = totalAppo > 0 ? Math.round((won / totalAppo) * 100) : null;
  const open = data.deals.filter((d) => OPEN_DEAL_PHASES.includes(d.phase)).length;
  const activeCustomers = data.customers.filter((c) => c.status === "稼働").length;

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <Kpi label="アポ獲得（総数）" value={String(totalAppo)} />
        <Kpi label="案件化" value={String(dealt)} tone={dealt > 0 ? "good" : "normal"} />
        <Kpi label="成約" value={String(won)} tone={won > 0 ? "good" : "normal"} />
        <Kpi label="成約率" value={winRate === null ? "—" : `${winRate}%`} hint="成約 / アポ獲得" />
        <Kpi label="商談中の案件" value={String(open)} hint="提案・見積・クロージング" />
        <Kpi label="稼働顧客" value={String(activeCustomers)} hint="ステータス稼働" />
      </section>

      <section>
        <Card
          title="件数の推移（アポ獲得・案件化・成約）"
          action={
            <div className="flex gap-1 rounded-full bg-neutral-100 p-0.5 dark:bg-neutral-800">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    period === p
                      ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white"
                      : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          }
        >
          <TrendChart points={trendPoints} series={SERIES} mode="line" showLine={false} />
        </Card>
      </section>

      <section>
        <Card
          title="率の推移（月次）"
          action={
            <span className="text-xs text-neutral-400">
              案件化率＝案件化÷アポ獲得　成約率＝成約÷案件化　アポ→成約率＝成約÷アポ獲得
            </span>
          }
        >
          <TrendChart points={monthlyRates} series={RATE_SERIES} mode="line" showLine={false} valueFormat="percent" />
          <p className="mt-2 text-[11px] text-neutral-400">
            その月に起きた件数どうしで割っています。分母が 0 の月は線が途切れます
          </p>
        </Card>
      </section>

      <section>
        <Card title="担当者別" action={<span className="text-xs text-neutral-400">棒＝アポ獲得数</span>}>
          <OwnerBars rows={byOwner} />
        </Card>
      </section>
    </div>
  );
}

/** 担当者ごとのアポ獲得（棒）＋案件化・成約の内訳 */
function OwnerBars({ rows }: { rows: SalesOwnerBreakdown[] }) {
  const max = Math.max(1, ...rows.map((r) => r.アポ獲得));
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-neutral-400">まだデータがありません</p>;
  }
  return (
    <ul className="flex flex-col gap-2.5 text-sm">
      {rows.map((r) => (
        <li key={r.name} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-neutral-600 dark:text-neutral-300" title={r.name}>
            {r.name}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
            <span className="block h-full rounded-full bg-[#9e8d70]" style={{ width: `${(r.アポ獲得 / max) * 100}%` }} />
          </span>
          <span className="w-7 text-right font-medium tabular-nums">{r.アポ獲得}</span>
          <span className="w-24 text-right text-xs tabular-nums text-neutral-400">
            <span className="text-[#1d6f80] dark:text-[#5aa5b5]">案{r.案件化}</span>
            {" ・ "}
            <span className={r.成約 > 0 ? "text-[#94532f] dark:text-[#c98a63]" : ""}>約{r.成約}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
