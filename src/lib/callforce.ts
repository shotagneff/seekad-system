// Callforce（AI架電サービス）の反響リードを読み書きする。
//
// リードの記録は Callforce 側の Supabase にある。こちらに複製すると
// 「どちらが正か」が曖昧になり、LINE通知の対応済み判定とズレる。
// そのため同期はせず、必要なときに直接読みに行く。
//
// 必要な環境変数:
//   CALLFORCE_SUPABASE_URL          例 https://xxxx.supabase.co
//   CALLFORCE_SUPABASE_SERVICE_KEY  service_role キー（サーバー側だけで使う）

export type LeadStatus =
  | "未対応"
  | "留守番電話"
  | "対応中"
  | "アポ獲得"
  | "追客中"
  | "失注"
  | "対象外";

/**
 * 並び順は「対応が進んだ順」。プルダウンでもこの順に出る。
 * 留守番電話は「こちらは架電したが、まだ会話が成立していない」状態。
 * かけ直しが要るので、未対応の次に置く。
 */
export const LEAD_STATUSES: LeadStatus[] = [
  "未対応",
  "留守番電話",
  "対応中",
  "アポ獲得",
  "追客中",
  "失注",
  "対象外",
];

export type Lead = {
  id: string;
  /** demo_call / ad_form / web_estimate */
  source: string;
  /** 受電デモ / 架電デモ / 見積もり など */
  demoType: string | null;
  /** 流入元（Retell受電デモ / homepage / Meta広告 など） */
  inflow: string | null;
  phoneNumber: string;
  companyName: string | null;
  /** 広告フォーム由来: ご担当者名 / メール / チェック項目(相手の課題) / メッセージ本文 */
  contactName: string | null;
  email: string | null;
  inquiryCategory: string | null;
  message: string | null;
  /** 新規 / 既存 / 身内 */
  callerType: string | null;
  durationSeconds: number | null;
  recordingUrl: string | null;
  assignedTo: string;
  status: LeadStatus;
  note: string | null;
  createdAt: string;
  /** 架電した時刻。null なら未架電 */
  respondedAt: string | null;
  respondedHow: string | null;
  /** 通知を出した時刻。初動の速さはここからの差で測る */
  notifiedAt: string | null;
  /** この電話番号に紐づくメモ。同じ番号の着信すべてで共有される */
  contactNote: string | null;
  /** この番号からの着信が通算で何回目か。1 なら初めて */
  callCount: number;
  /** 次に連絡する日（YYYY-MM-DD）。追客中の案件が沈まないための期日 */
  nextActionAt: string | null;
  /** 人が入力する流入経路。どこで当社を知ったか。アポ獲得時のみ必須 */
  acquisitionChannel: string | null;
};

/**
 * 流入経路の選択肢。
 * 自由入力にすると表記が割れて集計できないので、選ばせる。
 * 増やすときはここに足すだけでよい。
 */
export const ACQUISITION_CHANNELS = [
  "Meta広告",
  "Instagram",
  "ホームページ",
  "紹介",
  "イベント・交流会",
  "代理店",
  "既存顧客",
  "その他",
] as const;

/** アポ獲得にするには流入経路が要る。広告費の配分を判断するため */
export const CHANNEL_REQUIRED_STATUS: LeadStatus = "アポ獲得";

/** 追いかけが必要な状態。この2つだけ次回連絡日を持たせる */
export const FOLLOW_UP_STATUSES: LeadStatus[] = ["留守番電話", "追客中"];

/** 今日（JST）の YYYY-MM-DD */
export function todayJst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * 期日まであと何日か。負なら超過。
 * 日付だけで比較する。時刻を混ぜると「今日中」が曖昧になる。
 */
export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const a = Date.parse(`${date}T00:00:00Z`);
  const b = Date.parse(`${todayJst()}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

/** 既定の次回連絡日。1週間後 */
export function defaultNextAction(days = 7): string {
  return new Date(Date.now() + 9 * 3600 * 1000 + days * 86400000)
    .toISOString()
    .slice(0, 10);
}

/** 電話番号の末尾9桁。表記ゆれを吸収して同じ相手だと判定するためのキー */
export function phoneKey(phone: string): string {
  return String(phone).replace(/[^0-9]/g, "").slice(-9);
}

/**
 * アポ獲得は電話番号ごとに1件だけ数える。
 *
 * 同じ番号から複数回 問い合わせ／着信が入り、その複数行をどちらも「アポ獲得」にすると、
 * 行を数えるだけでは 1件のアポが 2件・3件に水増しされてしまう。番号でユニークにして防ぐ。
 * leads は新しい順で渡ってくるので、各番号の最新のアポ獲得行を代表として1つ残す。
 */
export function uniqueAppointmentLeads(leads: Lead[]): Lead[] {
  const seen = new Set<string>();
  const out: Lead[] = [];
  for (const l of leads) {
    if (l.status !== "アポ獲得") continue;
    const k = phoneKey(l.phoneNumber);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out;
}

type Row = Record<string, unknown>;

function config(): { url: string; key: string } | null {
  const url = process.env.CALLFORCE_SUPABASE_URL;
  const key = process.env.CALLFORCE_SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

export function hasCallforce(): boolean {
  return !!config();
}

async function callforceFetch(path: string, init?: RequestInit): Promise<Response> {
  const cfg = config();
  if (!cfg) throw new Error("CALLFORCE_SUPABASE_URL / CALLFORCE_SUPABASE_SERVICE_KEY が未設定です");
  return fetch(`${cfg.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

function toLead(r: Row): Lead {
  return {
    id: String(r.id),
    source: String(r.source ?? ""),
    demoType: (r.demo_type as string) ?? null,
    inflow: (r.inflow as string) ?? null,
    phoneNumber: String(r.phone_number ?? ""),
    companyName: (r.company_name as string) ?? null,
    contactName: (r.contact_name as string) ?? null,
    email: (r.email as string) ?? null,
    inquiryCategory: (r.inquiry_category as string) ?? null,
    message: (r.message as string) ?? null,
    callerType: (r.caller_type as string) ?? null,
    durationSeconds: (r.duration_seconds as number) ?? null,
    recordingUrl: (r.recording_url as string) ?? null,
    assignedTo: String(r.assigned_to ?? ""),
    status: (r.status as LeadStatus) ?? "未対応",
    note: (r.note as string) ?? null,
    createdAt: String(r.created_at ?? ""),
    respondedAt: (r.responded_at as string) ?? null,
    respondedHow: (r.responded_how as string) ?? null,
    notifiedAt: (r.notified_at as string) ?? null,
    contactNote: null,
    callCount: 1,
    nextActionAt: (r.next_action_at as string) ?? null,
    acquisitionChannel: (r.acquisition_channel as string) ?? null,
  };
}

/**
 * 反響リードを新しい順に取得する。
 *
 * メモは電話番号に紐づくので、番号ごとのメモを引いて各行に貼る。
 * 着信の回数も同じ番号で数えて入れる（2回目以降は「既存」として扱いたいため）。
 */
export async function listLeads(limit = 500): Promise<Lead[]> {
  const res = await callforceFetch(
    `lead_alerts?select=*&order=created_at.desc&limit=${limit}`
  );
  if (!res.ok) {
    throw new Error(`Callforce の取得に失敗しました (${res.status})`);
  }
  const leads = ((await res.json()) as Row[]).map(toLead);

  const notes = await fetchContactNotes();
  const counts = new Map<string, number>();
  for (const l of leads) {
    const k = phoneKey(l.phoneNumber);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  for (const l of leads) {
    const k = phoneKey(l.phoneNumber);
    l.contactNote = notes.get(k) ?? null;
    l.callCount = counts.get(k) ?? 1;
  }
  return leads;
}

/** 1件だけ引く。保存前の検証に使う */
export async function getLead(id: string): Promise<Lead | null> {
  const res = await callforceFetch(`lead_alerts?select=*&id=eq.${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  const rows = (await res.json()) as Row[];
  return rows[0] ? toLead(rows[0]) : null;
}

/** 1つの電話番号に紐づくメモ。アポ獲得管理へ運ぶときに使う */
export async function getContactNote(phoneNumber: string): Promise<string | null> {
  const key = phoneKey(phoneNumber);
  if (!key) return null;
  const res = await callforceFetch(`lead_contacts?select=note&phone_key=eq.${encodeURIComponent(key)}`);
  if (!res.ok) return null;
  const rows = (await res.json()) as Row[];
  return rows[0]?.note ? String(rows[0].note) : null;
}

/** 電話番号ごとのメモをまとめて引く */
async function fetchContactNotes(): Promise<Map<string, string>> {
  const res = await callforceFetch(`lead_contacts?select=phone_key,note`);
  if (!res.ok) return new Map();
  const rows = (await res.json()) as Row[];
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.note) map.set(String(r.phone_key), String(r.note));
  }
  return map;
}

/**
 * 電話番号に紐づくメモを保存する。
 * 同じ番号から次に着信したときも、このメモが見える。
 */
export async function saveContactNote(
  phoneNumber: string,
  note: string,
  by?: string
): Promise<void> {
  const key = phoneKey(phoneNumber);
  if (!key) throw new Error("電話番号が不正です");

  const res = await callforceFetch(`lead_contacts?on_conflict=phone_key`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      phone_key: key,
      phone_number: phoneNumber,
      note: note.trim() || null,
      updated_by: by ?? null,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    throw new Error(`メモの保存に失敗しました (${res.status})`);
  }
}

/**
 * 対応状況・担当・メモを更新する。
 *
 * 対応状況を「未対応」から動かしたら、それを対応の記録として扱う。
 * 通知のリンク先をこの一覧に統一したため、ここで記録しないと
 * responded_at がいつまでも入らず、5分超過のアラートが鳴り続ける。
 *
 * 先に入っている responded_at は上書きしない。最初に動いた時刻が初動なので、
 * 後から状況を変えた人の時刻で塗り替えると指標が甘くなる。
 */
export async function updateLead(
  id: string,
  patch: {
    status?: LeadStatus;
    assignedTo?: string;
    note?: string;
    by?: string;
    nextActionAt?: string | null;
    acquisitionChannel?: string | null;
  }
): Promise<void> {
  const body: Row = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.assignedTo !== undefined) body.assigned_to = patch.assignedTo;
  if (patch.note !== undefined) body.note = patch.note;
  if (patch.nextActionAt !== undefined) body.next_action_at = patch.nextActionAt;
  if (patch.acquisitionChannel !== undefined) body.acquisition_channel = patch.acquisitionChannel;

  // 追いかけが要る状態にしたら、期日が空のままにしない。
  // 期日が無いと一覧で沈み、誰も見返さなくなる（これがこの機能の目的）。
  if (patch.status !== undefined && FOLLOW_UP_STATUSES.includes(patch.status) && patch.nextActionAt === undefined) {
    const res = await callforceFetch(
      `lead_alerts?select=next_action_at&id=eq.${encodeURIComponent(id)}`
    );
    const rows = res.ok ? ((await res.json()) as Row[]) : [];
    if (rows[0] && !rows[0].next_action_at) body.next_action_at = defaultNextAction();
  }

  // 追いかけが終わった状態に変えたら、期日は落とす。
  // 残しておくと「本日の追客」に失注案件が混ざる。
  if (patch.status !== undefined && !FOLLOW_UP_STATUSES.includes(patch.status)) {
    body.next_action_at = null;
  }

  if (patch.status !== undefined && patch.status !== "未対応") {
    const res = await callforceFetch(
      `lead_alerts?select=responded_at,notified_at,created_at&id=eq.${encodeURIComponent(id)}`
    );
    const rows = res.ok ? ((await res.json()) as Row[]) : [];
    const row = rows[0];
    if (row && !row.responded_at) {
      body.responded_at = new Date().toISOString();
      body.responded_how = "manual";
      if (patch.by) body.responded_by = patch.by;

      // 通知が出る前に自分で見つけて対応した場合、通知時刻が無いままだと
      // 初動が計算できず空欄になる。リードが入った時刻を起点として立てておく。
      // （営業時間外に入った分は翌朝まで通知されないため、実際に起こる）
      if (!row.notified_at) body.notified_at = row.created_at;
    }
  }

  const res = await callforceFetch(`lead_alerts?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Callforce の更新に失敗しました (${res.status})`);
  }
}

/** 担当者の候補。Callforce 側の名簿をそのまま使う */
export async function listResponders(): Promise<string[]> {
  const res = await callforceFetch(`lead_responders?select=name&is_active=eq.true&order=name`);
  if (!res.ok) return [];
  return ((await res.json()) as Row[]).map((r) => String(r.name));
}

// ---------------------------------------------------------------------------
// 集計
// ---------------------------------------------------------------------------

export type WeeklyRow = {
  /** 週の始まり（月曜）。YYYY-MM-DD */
  weekStart: string;
  total: number;
  responded: number;
  /** 5分以内に架電できた件数 */
  withinFive: number;
  appointments: number;
};

/** JST の日付文字列にする */
function jstDate(iso: string): Date {
  return new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
}

/** その日を含む週の月曜日（JST）を YYYY-MM-DD で返す */
function weekStartOf(iso: string): string {
  const d = jstDate(iso);
  const dow = (d.getUTCDay() + 6) % 7; // 月曜=0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** 初動の分数。通知から架電までの差 */
export function firstResponseMinutes(lead: Lead): number | null {
  if (!lead.respondedAt || !lead.notifiedAt) return null;
  const diff = new Date(lead.respondedAt).getTime() - new Date(lead.notifiedAt).getTime();
  return Math.max(0, Math.round(diff / 60000));
}

export type DailyRow = {
  /** YYYY-MM-DD（JST） */
  date: string;
  total: number;
  responded: number;
  withinFive: number;
  appointments: number;
};

// ---------------------------------------------------------------------------
// 種別ごとの内訳つき集計（グラフ用）
// ---------------------------------------------------------------------------

/** グラフで積み上げる3つの区分 */
export const LEAD_KINDS = ["受電デモ", "架電デモ", "広告・Web"] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];

/**
 * リードを3区分に振り分ける。
 *
 * デモ2種の条件は一覧の絞り込み（LeadList の shown）と1文字まで揃える。
 * ここがズレると「一覧では架電デモ3件なのにグラフは2件」になり、
 * どちらが正しいのか分からなくなって数字全体が信用されなくなる。
 * demo_type が空の demo_call を架電デモに寄せているのは、種別を記録し始める前に
 * 入った行が架電デモしか無いため（一覧側も同じ理由で同じ条件になっている）。
 *
 * 残りは全部「広告・Web」に落とす。一覧は「どの絞り込みにも入らない行」を
 * 許せるが、積み上げ棒は内訳の合計が件数と一致していないと棒の高さ自体が
 * 嘘になるので、取りこぼしを作らないほうを優先した。
 */
export function leadKind(lead: Lead): LeadKind {
  if (lead.demoType === "受電デモ") return "受電デモ";
  if (lead.demoType === "架電デモ" || (!lead.demoType && lead.source === "demo_call")) {
    return "架電デモ";
  }
  return "広告・Web";
}

export type TrendPoint = {
  /** 集計の単位を表すキー。日別なら YYYY-MM-DD、週次なら週の月曜 */
  key: string;
  /** 軸に出す文字。日別は「08/14(木)」、週次は「08/10(月)〜」 */
  label: string;
  /** 土日。休みの日に件数が少ないのは当然なので、平日と見分ける */
  weekend: boolean;
  total: number;
  /** 種別ごとの件数。積み上げ棒はこれを使う */
  byKind: Record<LeadKind, number>;
  /** 折り返し済み。折れ線はこれを使う */
  responded: number;
};

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function emptyByKind(): Record<LeadKind, number> {
  return { 受電デモ: 0, 架電デモ: 0, "広告・Web": 0 };
}

/**
 * 日ごとの推移。新しい日が先頭ではなく、**古い日が先頭**で返す。
 * グラフは左から右に時間が進むため、表とは並びが逆になる。
 *
 * リードが1件も無かった日も 0 で埋める。抜いて並べると
 * 「反響が途切れた日」が見えず、勢いを読み違える。
 */
export function dailyTrend(leads: Lead[], days = 14): TrendPoint[] {
  const map = new Map<string, TrendPoint>();

  // 先に days 日ぶんの箱を作る（0件の日を落とさないため）
  const cursor = jstDate(new Date().toISOString());
  for (let i = 0; i < days; i++) {
    const key = cursor.toISOString().slice(0, 10);
    const dow = new Date(`${key}T00:00:00Z`).getUTCDay();
    map.set(key, {
      key,
      label: `${key.slice(5).replace("-", "/")}(${WEEKDAY_LABELS[dow]})`,
      weekend: dow === 0 || dow === 6,
      total: 0,
      byKind: emptyByKind(),
      responded: 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  for (const lead of leads) {
    if (!lead.createdAt) continue;
    const key = jstDate(lead.createdAt).toISOString().slice(0, 10);
    const p = map.get(key);
    if (!p) continue; // 期間外は数えない
    p.total++;
    p.byKind[leadKind(lead)]++;
    if (lead.respondedAt) p.responded++;
  }

  return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** 週ごとの推移。日別と同じく古い週が先頭 */
export function weeklyTrend(leads: Lead[]): TrendPoint[] {
  const map = new Map<string, TrendPoint>();
  for (const lead of leads) {
    if (!lead.createdAt) continue;
    const key = weekStartOf(lead.createdAt);
    const p =
      map.get(key) ??
      {
        key,
        label: `${key.slice(5).replace("-", "/")}(月)〜`,
        weekend: false,
        total: 0,
        byKind: emptyByKind(),
        responded: 0,
      };
    p.total++;
    p.byKind[leadKind(lead)]++;
    if (lead.respondedAt) p.responded++;
    map.set(key, p);
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/**
 * 日ごとに集計する。新しい日が先頭。
 * リードが1件も無かった日も 0 で埋める。抜けたまま並べると
 * 「反響が途切れた日」が見えず、勢いを読み違える。
 */
export function dailySummary(leads: Lead[], days = 14): DailyRow[] {
  const apptIds = new Set(uniqueAppointmentLeads(leads).map((l) => l.id));
  const map = new Map<string, DailyRow>();
  for (const lead of leads) {
    if (!lead.createdAt) continue;
    const key = jstDate(lead.createdAt).toISOString().slice(0, 10);
    const row = map.get(key) ?? { date: key, total: 0, responded: 0, withinFive: 0, appointments: 0 };
    row.total++;
    if (lead.respondedAt) row.responded++;
    const m = firstResponseMinutes(lead);
    if (m !== null && m <= 5) row.withinFive++;
    if (apptIds.has(lead.id)) row.appointments++;
    map.set(key, row);
  }

  // 直近 days 日を、空の日も含めて並べる
  const out: DailyRow[] = [];
  const cursor = jstDate(new Date().toISOString());
  for (let i = 0; i < days; i++) {
    const key = cursor.toISOString().slice(0, 10);
    out.push(map.get(key) ?? { date: key, total: 0, responded: 0, withinFive: 0, appointments: 0 });
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return out;
}

/** 週ごとに集計する。新しい週が先頭 */
export function weeklySummary(leads: Lead[]): WeeklyRow[] {
  const apptIds = new Set(uniqueAppointmentLeads(leads).map((l) => l.id));
  const map = new Map<string, WeeklyRow>();
  for (const lead of leads) {
    if (!lead.createdAt) continue;
    const key = weekStartOf(lead.createdAt);
    const row =
      map.get(key) ??
      { weekStart: key, total: 0, responded: 0, withinFive: 0, appointments: 0 };
    row.total++;
    if (lead.respondedAt) row.responded++;
    const m = firstResponseMinutes(lead);
    if (m !== null && m <= 5) row.withinFive++;
    if (apptIds.has(lead.id)) row.appointments++;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
}

export type Breakdown = {
  name: string;
  count: number;
  /** アポ獲得の件数 */
  appointments: number;
  /** 架電済みの件数 */
  responded: number;
};

/** 任意のキーで割る。件数の多い順 */
function groupBy(leads: Lead[], keyOf: (l: Lead) => string): Breakdown[] {
  const map = new Map<string, Breakdown>();
  for (const lead of leads) {
    const key = keyOf(lead);
    const row = map.get(key) ?? { name: key, count: 0, appointments: 0, responded: 0 };
    row.count++;
    if (lead.status === "アポ獲得") row.appointments++;
    if (lead.respondedAt) row.responded++;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/** 流入元ごと */
export function byInflow(leads: Lead[]): Breakdown[] {
  return groupBy(leads, (l) => l.inflow || "（不明）");
}

/** 対応状況ごと */
export function byStatus(leads: Lead[]): Breakdown[] {
  return groupBy(leads, (l) => l.status);
}

/** 担当者ごと */
export function byAssignee(leads: Lead[]): Breakdown[] {
  return groupBy(leads, (l) => l.assignedTo || "（未割当）");
}

/** 新規 / 既存 などの発信者区分ごと */
export function byCallerType(leads: Lead[]): Breakdown[] {
  return groupBy(leads, (l) => l.callerType || "（不明）");
}

/**
 * 流入経路ごとのアポ獲得数。
 *
 * 流入経路はアポ獲得のときだけ必須なので、それ以外は空のことが多い。
 * 全リードを流入経路で割っても「未入力」が大半になって読めない。
 * **アポ獲得した分だけ**を数えれば、どの経路が商談に化けたかが分かる。
 */
export function appointmentsByChannel(leads: Lead[]): Breakdown[] {
  const won = uniqueAppointmentLeads(leads);
  return groupBy(won, (l) => l.acquisitionChannel || "（未入力）");
}

/** 受電デモ / 架電デモ などの種別ごと */
export function byDemoType(leads: Lead[]): Breakdown[] {
  return groupBy(leads, (l) => l.demoType || "（不明）");
}

/**
 * 曜日 × 時間帯の件数（JST）。
 * どの曜日・何時に反響が来るかが分かれば、人を張る時間を決められる。
 * 時間は 9時〜20時（通知を出す時間帯）に絞る。
 */
export type Heatmap = {
  hours: number[];
  /** rows[曜日][時間] の件数。曜日は 月=0 〜 日=6 */
  rows: number[][];
  max: number;
};

export function byWeekdayHour(leads: Lead[], fromHour = 9, toHour = 20): Heatmap {
  const hours: number[] = [];
  for (let h = fromHour; h <= toHour; h++) hours.push(h);

  const rows = Array.from({ length: 7 }, () => new Array(hours.length).fill(0));
  let max = 0;
  for (const lead of leads) {
    if (!lead.createdAt) continue;
    const d = jstDate(lead.createdAt);
    const dow = (d.getUTCDay() + 6) % 7; // 月曜=0
    const idx = hours.indexOf(d.getUTCHours());
    if (idx < 0) continue; // 時間外に来たものはここでは数えない
    rows[dow][idx]++;
    if (rows[dow][idx] > max) max = rows[dow][idx];
  }
  return { hours, rows, max };
}

/**
 * デモ通話の長さの分布。
 * 短いほど途中で切られている。何秒まで聞いてもらえているかは
 * トークの出来を測る手がかりになる。
 */
export function durationBuckets(leads: Lead[]): { name: string; count: number }[] {
  const buckets = [
    { name: "〜30秒", max: 30 },
    { name: "30〜60秒", max: 60 },
    { name: "60〜90秒", max: 90 },
    { name: "90〜120秒", max: 120 },
    { name: "120秒〜", max: Infinity },
  ];
  const out = buckets.map((b) => ({ name: b.name, count: 0 }));
  for (const lead of leads) {
    if (lead.durationSeconds === null) continue;
    const i = buckets.findIndex((b) => lead.durationSeconds! <= b.max);
    out[i < 0 ? out.length - 1 : i].count++;
  }
  return out;
}

/** 初動のまとめ。母数が小さいうちは中央値を鵜呑みにしない */
export function responseStats(leads: Lead[]): {
  /** 初動を計算できた件数。これが小さいうちは中央値に意味がない */
  sample: number;
  median: number | null;
  withinFive: number;
  withinFiveRate: number | null;
} {
  const times = leads.map(firstResponseMinutes).filter((m): m is number => m !== null);
  const sorted = [...times].sort((a, b) => a - b);
  const withinFive = times.filter((m) => m <= 5).length;
  return {
    sample: times.length,
    median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    withinFive,
    withinFiveRate: times.length ? Math.round((withinFive / times.length) * 100) : null,
  };
}
