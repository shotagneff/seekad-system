// アポ獲得管理の型・区分・日付計算。
//
// DB に触らないものだけを置く。画面から import されるため、
// ここに pool を持ち込むと pg がブラウザ側のバンドルに入ってビルドが落ちる。
//
// 元の説明:
// アポ獲得管理。
//
// スプレッドシート「アポイント獲得」からの移管。
// 元は5シートが 案件ID で手作業のコピペで繋がっていた。
// その連鎖をサーバー側の処理として持ち込む。
//
//   リード ──(案件化済)──> 案件 ──(受注)──> 顧客
//                            └─(失注)──> 失注一覧（= 失注フェーズの案件を絞ったもの）
//
// 計算で出る値（想定年間総額・契約経過月数・LTV等）は列に持たない。
// 保存すると元の値を直したときに古い数字が残る。

// ---------------------------------------------------------------------------
// 区分
// ---------------------------------------------------------------------------

/** リードのフェーズ。案件化済になると案件へ進む */
export const LEAD_PHASES = ["リード", "初回面談", "案件化済", "協業", "失注"] as const;
export type LeadPhase = (typeof LEAD_PHASES)[number];

/** 案件のフェーズ。受注で顧客になり、失注で失注一覧に出る */
export const DEAL_PHASES = ["提案", "見積", "クロージング", "受注", "失注"] as const;
export type DealPhase = (typeof DEAL_PHASES)[number];

/**
 * フェーズごとの受注確度。
 * 元のシートは人が手で入れていたため、受注なのに0%の行が残っていた。
 * フェーズから自動で決めれば、そのずれは起きない。
 */
export const WIN_PROBABILITY: Record<DealPhase, number> = {
  提案: 50,
  見積: 70,
  クロージング: 85,
  受注: 100,
  失注: 0,
};

/** 確度。リードの温度感 */
export const GRADES = ["A（高）", "B（中高）", "C（中）", "D（低）", "不明"] as const;

/** リードソース種別 */
export const LEAD_SOURCES = [
  "テレアポ",
  "紹介",
  "イベント",
  "SNS・広告",
  "Web問合せ",
  "DM",
  "大学",
  "その他",
] as const;

/** 顧客のステータス */
export const CUSTOMER_STATUSES = ["稼働", "停止", "解約"] as const;

/** 案件に進んだとみなすフェーズ。ここに入ったら案件を作る */
export const PHASE_MAKES_DEAL: LeadPhase = "案件化済";
/** 顧客になったとみなすフェーズ */
export const PHASE_MAKES_CUSTOMER: DealPhase = "受注";
/** 商談中とみなすフェーズ。パイプラインの母数 */
export const OPEN_DEAL_PHASES: DealPhase[] = ["提案", "見積", "クロージング"];

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

export type Lead = {
  id: number;
  monthLabel: string | null;
  company: string | null;
  owner: string | null;
  phase: LeadPhase;
  grade: string | null;
  registeredOn: string | null;
  ceoName: string | null;
  contactName: string | null;
  contactTitle: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  industry: string | null;
  employeeSize: string | null;
  prefecture: string | null;
  nextAction: string | null;
  nextActionOn: string | null;
  /** アポ/次アクションの時刻 "HH:MM"。ホームの「今日のアポ」で使う */
  nextActionTime: string | null;
  leadSource: string | null;
  referrer: string | null;
  /** 商談メモ。案件化したときに案件へそのまま引き継がれる */
  note: string | null;
  updatedOn: string | null;
  /** 案件化済みか。案件テーブルに同じ案件IDがあるか */
  hasDeal: boolean;
};

export type Deal = {
  id: number;
  company: string | null;
  owner: string | null;
  phase: DealPhase;
  winProbability: number | null;
  nextAction: string | null;
  nextActionOn: string | null;
  proposedOn: string | null;
  monthlyFee: number;
  oneTimeFee: number;
  competitor: string | null;
  service: string | null;
  referrer: string | null;
  lostReason: string | null;
  /** 商談メモ。案件化のときにリードから引き継いだもの。以後はこちらを更新する */
  note: string | null;
  wonOn: string | null;
  lostOn: string | null;
  createdOn: string | null;
  updatedOn: string | null;
  /** 想定年間総額 = 月額×12 + ショット。保存せず毎回出す */
  annualTotal: number;
  /** 元リードが存在するか。移管時に1件だけ対応するリードが無い案件がある */
  hasLead: boolean;
  /** 顧客になっているか */
  customerId: string | null;
};

export type Customer = {
  id: string;
  company: string | null;
  owner: string | null;
  status: string;
  startedOn: string | null;
  monthlyFee: number;
  ceoName: string | null;
  industry: string | null;
  employeeSize: string | null;
  location: string | null;
  note: string | null;
  dealId: number | null;
  createdOn: string | null;
  updatedOn: string | null;
  /** 契約開始から今日までの満月数 */
  monthsElapsed: number;
  /** 年間継続価値 = 月額×12 */
  annualValue: number;
  /** 累計保守管理費 = 月額×経過月数 */
  cumulativeMonthly: number;
  /** 追加受注額（累計）= 元案件のショット金額 */
  additionalRevenue: number;
  /** LTV実績 = 累計保守 + 追加受注 */
  ltv: number;
};

// ---------------------------------------------------------------------------
// 日付まわり
// ---------------------------------------------------------------------------

/** 今日（JST）。サーバーのタイムゾーンに引きずられないよう明示する */
export function todayJst(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

/** YYYY-MM を取り出す */
export function monthOf(date: string | null): string | null {
  return date ? date.slice(0, 7) : null;
}

/**
 * 契約開始から今日までの満月数。
 * 「4/16開始で今日が8/15」なら3ヶ月。日を跨いでいなければ数えない。
 */
export function monthsBetween(from: string | null, to: string): number {
  if (!from) return 0;
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  let m = (ty - fy) * 12 + (tm - fm);
  if (td < fd) m -= 1;
  return Math.max(0, m);
}

/** 3テーブルをまとめた形。互いを参照して計算するため一緒に扱う */
export type SalesData = {
  leads: Lead[];
  deals: Deal[];
  customers: Customer[];
};

// ---------------------------------------------------------------------------
// ダッシュボード用の集計（反響リードと同じ推移グラフに載せる）
//
// 「毎日 何件アポが取れて / 何件案件化して / 何件成約したか」を出す。
//   アポ獲得 … リードの登録日（registeredOn）
//   案件化   … 案件の作成日（createdOn）
//   成約     … 案件の受注日（wonOn）
// 3つは包含関係（アポ⊃案件化⊃成約）なので積み上げず、日ごとに並べて見せる。
// ---------------------------------------------------------------------------

const WD_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

/** 推移グラフ1点分（components/trend-chart の TrendDatum と同じ形） */
export type SalesTrendPoint = {
  key: string;
  label: string;
  weekend: boolean;
  total: number;
  /** null は「出せない」（率の分母が 0 など）。グラフでは点を打たない */
  byKind: Record<string, number | null>;
  responded: number;
};

/** 系列（棒の3本）。表示順もこの順 */
export const APPOINTMENT_SERIES = ["アポ獲得", "案件化", "成約"] as const;

function emptyKinds(): Record<string, number> {
  return { アポ獲得: 0, 案件化: 0, 成約: 0 };
}

/** その日付が含まれる週の月曜（JST）。YYYY-MM-DD */
function weekStartOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 月曜=0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** 日ごとの推移。古い日が先頭（グラフは左→右に時間が進む）。0件の日も埋める */
export function appointmentDailyTrend(data: SalesData, days = 14): SalesTrendPoint[] {
  const map = new Map<string, SalesTrendPoint>();
  const cur = new Date(`${todayJst()}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    const key = cur.toISOString().slice(0, 10);
    const dow = new Date(`${key}T00:00:00Z`).getUTCDay();
    map.set(key, {
      key,
      label: `${key.slice(5).replace("-", "/")}(${WD_LABELS[dow]})`,
      weekend: dow === 0 || dow === 6,
      total: 0,
      byKind: emptyKinds(),
      responded: 0,
    });
    cur.setUTCDate(cur.getUTCDate() - 1);
  }
  const bump = (dateStr: string | null, kind: string) => {
    if (!dateStr) return;
    const p = map.get(dateStr.slice(0, 10));
    if (p) p.byKind[kind] = (p.byKind[kind] ?? 0) + 1;
  };
  for (const l of data.leads) bump(l.registeredOn, "アポ獲得");
  for (const d of data.deals) bump(d.createdOn, "案件化");
  for (const d of data.deals) bump(d.wonOn, "成約");
  for (const p of map.values()) p.total = Math.max(p.byKind.アポ獲得 ?? 0, p.byKind.案件化 ?? 0, p.byKind.成約 ?? 0);
  return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** 週ごとの推移。古い週が先頭 */
export function appointmentWeeklyTrend(data: SalesData): SalesTrendPoint[] {
  const map = new Map<string, SalesTrendPoint>();
  const bump = (dateStr: string | null, kind: string) => {
    if (!dateStr) return;
    const ws = weekStartOf(dateStr.slice(0, 10));
    let p = map.get(ws);
    if (!p) {
      p = {
        key: ws,
        label: `${ws.slice(5).replace("-", "/")}(月)〜`,
        weekend: false,
        total: 0,
        byKind: emptyKinds(),
        responded: 0,
      };
      map.set(ws, p);
    }
    p.byKind[kind] = (p.byKind[kind] ?? 0) + 1;
  };
  for (const l of data.leads) bump(l.registeredOn, "アポ獲得");
  for (const d of data.deals) bump(d.createdOn, "案件化");
  for (const d of data.deals) bump(d.wonOn, "成約");
  for (const p of map.values()) p.total = Math.max(p.byKind.アポ獲得 ?? 0, p.byKind.案件化 ?? 0, p.byKind.成約 ?? 0);
  return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** 月ごとの推移。今月を右端に、直近 months ヶ月ぶんを 0 件の月も埋めて並べる */
export function appointmentMonthlyTrend(data: SalesData, months = 12): SalesTrendPoint[] {
  const map = new Map<string, SalesTrendPoint>();
  let [y, m] = todayJst().slice(0, 7).split("-").map(Number);
  for (let i = 0; i < months; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    map.set(key, {
      key,
      label: `${y}/${m}`,
      weekend: false,
      total: 0,
      byKind: emptyKinds(),
      responded: 0,
    });
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  const bump = (dateStr: string | null, kind: string) => {
    if (!dateStr) return;
    const p = map.get(dateStr.slice(0, 7));
    if (p) p.byKind[kind] = (p.byKind[kind] ?? 0) + 1;
  };
  for (const l of data.leads) bump(l.registeredOn, "アポ獲得");
  for (const d of data.deals) bump(d.createdOn, "案件化");
  for (const d of data.deals) bump(d.wonOn, "成約");
  for (const p of map.values()) p.total = Math.max(p.byKind.アポ獲得 ?? 0, p.byKind.案件化 ?? 0, p.byKind.成約 ?? 0);
  return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** 率の系列。表示順もこの順 */
export const APPOINTMENT_RATE_SERIES = ["案件化率", "成約率", "アポ→成約率"] as const;

/**
 * 件数の推移から率の推移を出す（%）。
 *   案件化率   … 案件化 ÷ アポ獲得
 *   成約率     … 成約 ÷ 案件化
 *   アポ→成約率 … 成約 ÷ アポ獲得（KPI の「成約率」と同じ定義）
 * どれも「その期間に起きた件数どうし」で割る。成績ページの CVR と同じ考え方。
 * 分母が 0 の期間は率が出せないので null（グラフでは線が途切れる）。
 */
export function appointmentRateTrend(points: SalesTrendPoint[]): SalesTrendPoint[] {
  const rate = (num: number, den: number) => (den === 0 ? null : Math.round((num / den) * 1000) / 10);
  return points.map((p) => {
    const appo = p.byKind.アポ獲得 ?? 0;
    const dealt = p.byKind.案件化 ?? 0;
    const won = p.byKind.成約 ?? 0;
    return {
      ...p,
      total: 0,
      byKind: {
        案件化率: rate(dealt, appo),
        成約率: rate(won, dealt),
        "アポ→成約率": rate(won, appo),
      },
    };
  });
}

export type SalesOwnerBreakdown = { name: string; アポ獲得: number; 案件化: number; 成約: number };

/** 担当者ごとのアポ獲得・案件化・成約。アポ獲得の多い順 */
export function appointmentByOwner(data: SalesData): SalesOwnerBreakdown[] {
  const map = new Map<string, SalesOwnerBreakdown>();
  const get = (name: string | null) => {
    const k = (name ?? "").trim() || "（未割当）";
    let r = map.get(k);
    if (!r) {
      r = { name: k, アポ獲得: 0, 案件化: 0, 成約: 0 };
      map.set(k, r);
    }
    return r;
  };
  for (const l of data.leads) get(l.owner).アポ獲得++;
  for (const d of data.deals) {
    get(d.owner).案件化++;
    if (d.phase === "受注") get(d.owner).成約++;
  }
  return [...map.values()].sort((a, b) => b.アポ獲得 - a.アポ獲得);
}
