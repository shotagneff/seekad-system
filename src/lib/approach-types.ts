// アプローチリスト（業界 × 都道府県ごとの営業先リスト）の共通定義。
//
// DB にも Cookie にも依存しないので、サーバ・クライアントの双方から読める。
// 選択肢（手段・状況）を1箇所に集めておかないと、画面の選択肢と集計の判定が
// ずれて「選べるのに集計に出ない」が起きる。

/** アプローチ手段 */
export const APPROACH_CHANNELS = ["未対応", "テレアポ", "SNS DM", "手紙"] as const;
export type ApproachChannel = (typeof APPROACH_CHANNELS)[number];

/**
 * 状況。
 *
 *   未対応         まだ何もしていない
 *   不在           コールしたが不在
 *   受付突破できず コールしたが受付で断られた
 *   突破・アポ不可 受付は突破したがアポは取れなかった
 *   返信あり       DM・手紙に返信があった
 *   アポ獲得       アポイントが取れた
 */
export const APPROACH_STATUSES = [
  "未対応",
  "不在",
  "受付突破できず",
  "突破・アポ不可",
  "返信あり",
  "アポ獲得",
] as const;
export type ApproachStatus = (typeof APPROACH_STATUSES)[number];

/** 「反応があった」とみなす状況（反応率の分子） */
export const RESPONDED_STATUSES: readonly ApproachStatus[] = ["突破・アポ不可", "返信あり", "アポ獲得"];

/** 状況ごとの色。table-ui の TONE のキー */
export const STATUS_TONE: Record<ApproachStatus, "gray" | "sky" | "orange" | "yellow" | "violet" | "red"> = {
  未対応: "gray",
  不在: "sky",
  受付突破できず: "red",
  "突破・アポ不可": "orange",
  返信あり: "violet",
  アポ獲得: "yellow",
};

export function toChannel(value: unknown): ApproachChannel {
  return APPROACH_CHANNELS.includes(value as ApproachChannel) ? (value as ApproachChannel) : "未対応";
}

export function toStatus(value: unknown): ApproachStatus {
  return APPROACH_STATUSES.includes(value as ApproachStatus) ? (value as ApproachStatus) : "未対応";
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
  { key: "contactName", label: "先方担当者", required: false },
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
  channel: ApproachChannel;
  status: ApproachStatus;
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

export type SalesSummaryRow = {
  actorId: string;
  actorName: string;
  approaches: number;
  byChannel: Record<string, number>;
  responded: number;
  appointments: number;
};

export type SummaryRange = "today" | "week" | "month" | "all";
export const SUMMARY_RANGES: { key: SummaryRange; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "week", label: "今週" },
  { key: "month", label: "今月" },
  { key: "all", label: "全期間" },
];

export function pct(numer: number, denom: number): string {
  if (!denom) return "–";
  return `${Math.round((numer / denom) * 1000) / 10}%`;
}
