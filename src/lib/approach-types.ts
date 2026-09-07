// アプローチリスト（業界 × 都道府県ごとの営業先リスト）の共通定義。
//
// DB にも Cookie にも依存しないので、サーバ・クライアントの双方から読める。
// 選択肢（手段・状況）を1箇所に集めておかないと、画面の選択肢と集計の判定が
// ずれて「選べるのに集計に出ない」が起きる。

/**
 * アプローチ手段。テレアポ・DM・手紙の3つで、会社ごとにそれぞれ結果の欄を持つ。
 * 「手段を1つ選んで状況を1つ書く」形にすると、テレアポもDMもした会社で片方の結果が消える。
 */
export const APPROACH_CHANNELS = ["テレアポ", "DM", "手紙"] as const;
export type ApproachChannel = (typeof APPROACH_CHANNELS)[number];

/** テレアポの結果 */
export const TEL_STATUSES = ["未対応", "不在", "受付突破できず", "突破・アポ不可", "アポ獲得"] as const;
/** DM（SNS・メール）の結果 */
export const DM_STATUSES = ["未送信", "送信済み", "返信あり", "アポ獲得"] as const;
/** 手紙の結果 */
export const LETTER_STATUSES = ["未送付", "送付済み", "返信あり", "アポ獲得"] as const;

export type ApproachStatus =
  | (typeof TEL_STATUSES)[number]
  | (typeof DM_STATUSES)[number]
  | (typeof LETTER_STATUSES)[number];

export const CHANNEL_STATUSES: Record<ApproachChannel, readonly ApproachStatus[]> = {
  テレアポ: TEL_STATUSES,
  DM: DM_STATUSES,
  手紙: LETTER_STATUSES,
};

/** 「まだ何もしていない」を表す値（手段ごとに1つ） */
export const INITIAL_STATUS: Record<ApproachChannel, ApproachStatus> = {
  テレアポ: "未対応",
  DM: "未送信",
  手紙: "未送付",
};
export const INITIAL_STATUSES: readonly ApproachStatus[] = ["未対応", "未送信", "未送付"];

/** 「反応があった」とみなす結果（反応率の分子）。アポ獲得も含む */
export const RESPONDED_STATUSES: readonly ApproachStatus[] = ["突破・アポ不可", "返信あり", "アポ獲得"];

/** 結果ごとの色。table-ui の TONE のキー */
export const STATUS_TONE: Record<ApproachStatus, "gray" | "sky" | "orange" | "yellow" | "violet" | "red"> = {
  未対応: "gray",
  未送信: "gray",
  未送付: "gray",
  不在: "sky",
  送信済み: "sky",
  送付済み: "sky",
  受付突破できず: "red",
  "突破・アポ不可": "orange",
  返信あり: "violet",
  アポ獲得: "yellow",
};

export function toChannel(value: unknown): ApproachChannel | null {
  return APPROACH_CHANNELS.includes(value as ApproachChannel) ? (value as ApproachChannel) : null;
}

/** その手段で選べる値に寄せる。外れていれば初期値 */
export function toStatus(channel: ApproachChannel, value: unknown): ApproachStatus {
  const list = CHANNEL_STATUSES[channel];
  return list.includes(value as ApproachStatus) ? (value as ApproachStatus) : INITIAL_STATUS[channel];
}

/** 会社1件の、手段ごとの結果 */
export type ChannelStatuses = Record<ApproachChannel, ApproachStatus>;

export function isUntouched(st: ChannelStatuses): boolean {
  return APPROACH_CHANNELS.every((ch) => st[ch] === INITIAL_STATUS[ch]);
}
export function hasAppointment(st: ChannelStatuses): boolean {
  return APPROACH_CHANNELS.some((ch) => st[ch] === "アポ獲得");
}

/**
 * スプレッドシートの列と、システム側の項目の対応。
 * 値はシート1行目の見出し文字列。会社名だけ必須。
 */
export const COLUMN_FIELDS = [
  { key: "companyName", label: "会社名", required: true },
  { key: "phone", label: "電話番号", required: false },
  { key: "address", label: "住所", required: false },
  { key: "website", label: "ホームページ", required: false },
  { key: "linkedin", label: "LinkedIn", required: false },
  { key: "contactName", label: "代表取締役", required: false },
  { key: "sheetNote", label: "備考", required: false },
] as const;
export type ColumnFieldKey = (typeof COLUMN_FIELDS)[number]["key"];
export type ColumnMap = Partial<Record<ColumnFieldKey, string>>;

export const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
  "全国・その他",
] as const;

export type Industry = {
  id: string;
  name: string;
  sortOrder: number;
  listCount: number;
  companyCount: number;
  untouchedCount: number;
};

export type ApproachList = {
  id: string;
  industryId: string;
  industryName: string;
  prefecture: string;
  name: string | null;
  sheetUrl: string;
  columnMap: ColumnMap;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  companyCount: number;
  untouchedCount: number;
  appointmentCount: number;
};

export type Company = {
  id: string;
  listId: string;
  companyName: string;
  phone: string | null;
  address: string | null;
  website: string | null;
  linkedin: string | null;
  contactName: string | null;
  sheetNote: string | null;
  /** シートの全列（見出し → 値）。対応付けしなかった列もここに残る */
  raw: Record<string, string>;
  assigneeId: string | null;
  assigneeName: string | null;
  /** 手段ごとの結果 */
  statuses: ChannelStatuses;
  memo: string | null;
  lastActionAt: string | null;
  lastActionBy: string | null;
  lastActionByName: string | null;
  createdAt: string;
};

export type ApproachAction = {
  id: string;
  companyId: string;
  companyName: string;
  listId: string;
  listLabel: string;
  actorId: string;
  actorName: string;
  channel: ApproachChannel;
  status: ApproachStatus;
  memo: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// 営業別サマリーの集計（純粋関数。サーバで actions を読んでここに通す）
// ---------------------------------------------------------------------------

/** 遷移の段階。手段ごとに3段（例: テレアポ = コール → 受付突破 → アポ獲得） */
export const FUNNEL_LABELS: Record<ApproachChannel, [string, string, string]> = {
  テレアポ: ["コール", "受付突破", "アポ獲得"],
  DM: ["送信", "返信あり", "アポ獲得"],
  手紙: ["送付", "返信あり", "アポ獲得"],
};

/** 結果がどの段階まで進んだか。0 = まだ何もしていない */
export function stageRank(channel: ApproachChannel, status: string): 0 | 1 | 2 | 3 {
  if (status === "アポ獲得") return 3;
  if (channel === "テレアポ") {
    if (status === "突破・アポ不可") return 2;
    if (status === "不在" || status === "受付突破できず") return 1;
    return 0;
  }
  if (status === "返信あり") return 2;
  if (status === "送信済み" || status === "送付済み") return 1;
  return 0;
}

/** 各段階に到達した会社数（重複なし）。[1段目, 2段目, 3段目] */
export type FunnelCounts = [number, number, number];

export type ChannelStats = {
  /** 動いた回数（結果を初期値以外に変えた操作の数）。同じ会社に2回電話すれば2 */
  approaches: number;
  /** 段階ごとの会社数 */
  funnel: FunnelCounts;
};

export type SalesSummaryRow = {
  actorId: string;
  actorName: string;
  /** 3手段の合計 */
  total: ChannelStats;
  byChannel: Record<ApproachChannel, ChannelStats>;
};

export type DailyPoint = {
  /** yyyy-mm-dd（JST） */
  date: string;
  label: string;
  weekend: boolean;
  total: number;
  byChannel: Record<ApproachChannel, number>;
  appointments: number;
};

export type SummaryData = {
  people: SalesSummaryRow[];
  /** 全員の合計 */
  overall: SalesSummaryRow;
  daily: DailyPoint[];
};

/** DB から読んだ履歴1行（集計の入力） */
export type RawAction = {
  actorId: string;
  actorName: string;
  companyId: string;
  channel: ApproachChannel;
  status: string;
  /** yyyy-mm-dd（JST） */
  date: string;
};

function emptyStats(): ChannelStats {
  return { approaches: 0, funnel: [0, 0, 0] };
}

function emptyRow(actorId: string, actorName: string): SalesSummaryRow {
  return {
    actorId,
    actorName,
    total: emptyStats(),
    byChannel: { テレアポ: emptyStats(), DM: emptyStats(), 手紙: emptyStats() },
  };
}

/** 反応率・アポ獲得率など、段階間の割合（%文字列）。分母0なら "–" */
export function pct(numer: number, denom: number): string {
  if (!denom) return "–";
  return `${Math.round((numer / denom) * 1000) / 10}%`;
}

/**
 * 履歴を、人ごと・手段ごと・日ごとに集計する。
 *
 * 段階（funnel）は会社単位で数える。同じ会社に「送信済み → 返信あり」と2回記録しても、
 * 送信1社・返信1社。回数（approaches）は操作の数なので2になる。
 */
export function aggregateActions(rows: RawAction[], fromDate: string, toDate: string): SummaryData {
  const people = new Map<string, SalesSummaryRow>();
  const overall = emptyRow("all", "全員");
  // 会社×手段ごとの最高到達段階（人別と全体）
  const best = new Map<string, number>();

  const bump = (row: SalesSummaryRow, ch: ApproachChannel) => {
    row.byChannel[ch].approaches += 1;
    row.total.approaches += 1;
  };
  const noteBest = (key: string, rank: number) => {
    best.set(key, Math.max(best.get(key) ?? 0, rank));
  };

  const daily = new Map<string, DailyPoint>();

  for (const r of rows) {
    const rank = stageRank(r.channel, r.status);
    if (rank === 0) continue;

    let row = people.get(r.actorId);
    if (!row) {
      row = emptyRow(r.actorId, r.actorName);
      people.set(r.actorId, row);
    }
    bump(row, r.channel);
    bump(overall, r.channel);
    noteBest(`${r.actorId}|${r.companyId}|${r.channel}`, rank);
    noteBest(`all|${r.companyId}|${r.channel}`, rank);

    let d = daily.get(r.date);
    if (!d) {
      d = { date: r.date, label: "", weekend: false, total: 0, byChannel: { テレアポ: 0, DM: 0, 手紙: 0 }, appointments: 0 };
      daily.set(r.date, d);
    }
    d.total += 1;
    d.byChannel[r.channel] += 1;
    if (rank === 3) d.appointments += 1;
  }

  for (const [key, rank] of best) {
    const [actorId, , ch] = key.split("|") as [string, string, ApproachChannel];
    const row = actorId === "all" ? overall : people.get(actorId);
    if (!row) continue;
    for (let stage = 1; stage <= rank; stage++) {
      row.byChannel[ch].funnel[stage - 1] += 1;
      row.total.funnel[stage - 1] += 1;
    }
  }

  // 日付は期間内を埋めて連続させる（動きのない日も 0 で出す）
  const points: DailyPoint[] = [];
  const cur = new Date(`${fromDate}T00:00:00+09:00`);
  const endT = new Date(`${toDate}T00:00:00+09:00`).getTime();
  while (cur.getTime() <= endT) {
    const key = cur.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    const dow = new Date(`${key}T00:00:00+09:00`).getUTCDay(); // UTC基準だと前日になる場合があるので下で補正
    const jstDow = (dow + 1) % 7; // +09:00 の 00:00 は UTC の前日15:00 → 曜日を1つ進める
    const d = daily.get(key) ?? { date: key, label: "", weekend: false, total: 0, byChannel: { テレアポ: 0, DM: 0, 手紙: 0 }, appointments: 0 };
    d.label = `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
    d.weekend = jstDow === 0 || jstDow === 6;
    points.push(d);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const list = [...people.values()].sort(
    (a, b) => b.total.approaches - a.total.approaches || a.actorName.localeCompare(b.actorName, "ja"),
  );
  return { people: list, overall, daily: points };
}

export type SummaryRange = "today" | "week" | "month" | "all";
export const SUMMARY_RANGES: { key: SummaryRange; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "week", label: "今週" },
  { key: "month", label: "今月" },
  { key: "all", label: "全期間" },
];
