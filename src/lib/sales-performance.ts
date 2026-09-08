// 成績（元スプレッドシートの「月間蓄積データ」）。
//
// 元シートは毎月その時点の値を書き写した記録だった。
// そのため「全体」が各営業マンの合計と合わない月がいくつもあった
// （書き写した時刻が違うため）。ここでは案件データから毎回計算し直す。
// 数字が動くのは元データを直したときだけになる。

import {
  Deal,
  Lead,
  OPEN_DEAL_PHASES,
  SalesData,
  monthOf,
  normalizeOwnerName,
  todayJst,
} from "@/lib/sales-types";

/** 表に出す指標。順番は元シートに合わせる */
export const METRICS = [
  { key: "leads", label: "リード獲得数", format: "count" },
  { key: "cvrProposal", label: "CVR (→提案)", format: "percent" },
  { key: "proposals", label: "提案数", format: "count" },
  { key: "cvrWin", label: "CVR (→成約)", format: "percent" },
  { key: "wins", label: "成約数", format: "count" },
  { key: "losses", label: "失注数", format: "count" },
  { key: "winLossRatio", label: "受注/失注比", format: "ratio" },
  { key: "closeRate", label: "成約率(リード→成約)", format: "percent" },
  { key: "mrr", label: "受注MRR", format: "yen" },
  { key: "oneTime", label: "受注ショット合計", format: "yen" },
  { key: "total", label: "受注総額", format: "yen" },
  { key: "avgMonthly", label: "平均受注単価(月額)", format: "yen" },
  { key: "avgCycle", label: "平均商談期間(日)", format: "days" },
  { key: "openDeals", label: "商談中案件数", format: "count" },
  { key: "weightedPipeline", label: "加重パイプライン", format: "yen" },
  { key: "activeLeads", label: "アクティブリード数", format: "count" },
] as const;

export type MetricKey = (typeof METRICS)[number]["key"];
export type Metrics = Record<MetricKey, number>;

/**
 * 担当者列の並び順の希望。ここにある人を先頭にこの順で出し、残りは名前順。
 * 候補そのものは登録ユーザー（ユーザー管理）と案件データから作るので、
 * 新しく登録した人はここに足さなくても自動で選べる。
 */
const OWNER_ORDER = ["平賀翔大", "佐藤翔永", "宅間宗大", "桐髙颯己"];

export const TOTAL_COLUMN = "全体";

/** その月の末日。月末時点のスナップショットを取るために使う */
function endOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : (numerator / denominator) * 100;
}

/**
 * ひと月ぶんの数字を出す。
 *
 * 件数系はその月に起きたこと（登録日・提案日・受注日・失注日）で数える。
 * 商談中案件数・加重パイプライン・アクティブリード数だけは
 * 「その時点でいくつ抱えていたか」なので月末時点のスナップショットで出す。
 */
function compute(leads: Lead[], deals: Deal[], month: string | null): Metrics {
  const asOf = month ? endOfMonth(month) : todayJst();
  const inMonth = (date: string | null) => (month === null ? date !== null : monthOf(date) === month);

  const gained = leads.filter((l) => inMonth(l.registeredOn)).length;
  const proposals = deals.filter((d) => inMonth(d.proposedOn)).length;
  const wonDeals = deals.filter((d) => inMonth(d.wonOn));
  const wins = wonDeals.length;
  const losses = deals.filter((d) => inMonth(d.lostOn)).length;

  const mrr = wonDeals.reduce((s, d) => s + d.monthlyFee, 0);
  const oneTime = wonDeals.reduce((s, d) => s + d.oneTimeFee, 0);

  // 提案日から受注日までの日数。どちらか欠けている案件は平均に混ぜない
  const cycles = wonDeals
    .filter((d) => d.proposedOn && d.wonOn)
    .map((d) => daysBetween(d.proposedOn!, d.wonOn!));

  // 月末時点でまだ決着していなかった案件
  const openAtEnd = deals.filter((d) => {
    if (!d.proposedOn || d.proposedOn > asOf) return false;
    if (d.wonOn && d.wonOn <= asOf) return false;
    if (d.lostOn && d.lostOn <= asOf) return false;
    return month === null ? OPEN_DEAL_PHASES.includes(d.phase) : true;
  });

  const activeLeads = leads.filter(
    (l) => l.registeredOn && l.registeredOn <= asOf && l.phase !== "失注"
  ).length;

  return {
    leads: gained,
    proposals,
    wins,
    losses,
    cvrProposal: ratio(proposals, gained),
    cvrWin: ratio(wins, proposals),
    closeRate: ratio(wins, gained),
    // 失注ゼロで割ると出せないので、そのときは勝ち数をそのまま出す
    winLossRatio: losses === 0 ? wins : wins / losses,
    mrr,
    oneTime,
    total: mrr + oneTime,
    avgMonthly: wins === 0 ? 0 : Math.round(mrr / wins),
    avgCycle: cycles.length === 0 ? 0 : Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length),
    openDeals: openAtEnd.length,
    weightedPipeline: Math.round(
      openAtEnd.reduce((s, d) => s + d.monthlyFee * ((d.winProbability ?? 0) / 100), 0)
    ),
    activeLeads,
  };
}

export type PerformanceCell = { owner: string; metrics: Metrics };
export type PerformanceMonth = { month: string; columns: PerformanceCell[] };

export type Performance = {
  owners: string[];
  months: PerformanceMonth[];
  /** 累計（全期間） */
  cumulative: PerformanceCell[];
};

/**
 * 担当者の候補。
 *   registered … ユーザー管理に登録されている有効なユーザーの表示名（API が付けてくる）
 *   data       … リード・案件に既に入っている担当（退職した人の過去案件も列に残す）
 * 並びは OWNER_ORDER の順を先に、それ以外は名前順。
 */
export function orderedOwners(data: SalesData, registered: readonly string[] = []): string[] {
  const found = new Set<string>();
  for (const name of registered) {
    const n = normalizeOwnerName(name);
    if (n) found.add(n);
  }
  for (const l of data.leads) if (l.owner) found.add(l.owner);
  for (const d of data.deals) if (d.owner) found.add(d.owner);
  const head = OWNER_ORDER.filter((o) => found.has(o));
  const rest = [...found].filter((o) => !OWNER_ORDER.includes(o)).sort();
  return [...head, ...rest];
}

/** 出す月の一覧。データがある最初の月から今月まで、抜けなく並べる */
function monthRange(data: SalesData): string[] {
  const stamps = [
    ...data.leads.map((l) => l.registeredOn),
    ...data.deals.map((d) => d.proposedOn),
    ...data.deals.map((d) => d.wonOn),
    ...data.deals.map((d) => d.lostOn),
  ]
    .map(monthOf)
    .filter((m): m is string => m !== null);
  if (!stamps.length) return [];

  const first = stamps.reduce((a, b) => (a < b ? a : b));
  const last = todayJst().slice(0, 7);
  const out: string[] = [];
  let [y, m] = first.split("-").map(Number);
  while (`${y}-${String(m).padStart(2, "0")}` <= last) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function buildPerformance(data: SalesData, registered: readonly string[] = []): Performance {
  const owners = orderedOwners(data, registered);
  const columns = [...owners, TOTAL_COLUMN];

  const cellsFor = (month: string | null): PerformanceCell[] =>
    columns.map((owner) => ({
      owner,
      metrics:
        owner === TOTAL_COLUMN
          ? compute(data.leads, data.deals, month)
          : compute(
              data.leads.filter((l) => l.owner === owner),
              data.deals.filter((d) => d.owner === owner),
              month
            ),
    }));

  return {
    owners,
    months: monthRange(data).map((month) => ({ month, columns: cellsFor(month) })),
    cumulative: cellsFor(null),
  };
}

// ---------------------------------------------------------------------------
// 表示
// ---------------------------------------------------------------------------

export function formatMetric(value: number, format: string): string {
  switch (format) {
    case "percent":
      return `${value.toFixed(1)}%`;
    case "yen":
      return `¥${Math.round(value).toLocaleString("ja-JP")}`;
    case "ratio":
      return value.toFixed(1);
    case "days":
      return `${value}日`;
    default:
      return String(value);
  }
}
