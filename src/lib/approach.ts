// アプローチリストのサーバ側ロジック（DB アクセス・スプレッドシート取り込み）。
//
// クライアントから使う型・定数は approach-types.ts にある。
// このファイルは pool（pg）を持つので、クライアントコンポーネントから import しない。

import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { pool } from "./db";
import { verifySessionToken } from "./auth-token";
import { ensureApproachTables } from "./schema";
import {
  APPROACH_CHANNELS,
  COLUMN_FIELDS,
  aggregateActions,
  toStatus,
  type ApproachAction,
  type ApproachChannel,
  type ApproachList,
  type ApproachStatus,
  type ChannelStatuses,
  type ColumnMap,
  type Company,
  type Industry,
  type RawAction,
  type SummaryData,
  type SummaryRange,
} from "./approach-types";

/** 「まだ何もしていない」会社の条件（SQL） */
const UNTOUCHED_SQL = `tel_status = '未対応' AND dm_status = '未送信' AND letter_status = '未送付'`;
/** どれかの手段でアポが取れている会社の条件（SQL） */
const APPOINTED_SQL = `(tel_status = 'アポ獲得' OR dm_status = 'アポ獲得' OR letter_status = 'アポ獲得')`;

const COOKIE_NAME = "igos_session";

/** Cookie から現在のログインIDを取る。取れなければ null */
export async function getLoginId(req: NextRequest): Promise<string | null> {
  const secret = String(process.env.IGOS_AUTH_SECRET ?? "").trim();
  if (!secret) return null;
  const token = req.cookies.get(COOKIE_NAME)?.value ?? "";
  if (!token) return null;
  const payload = await verifySessionToken(token, secret);
  return payload?.loginId ?? null;
}

// ---------------------------------------------------------------------------
// スプレッドシート
// ---------------------------------------------------------------------------

/**
 * 共有URLを CSV 取得用URLに変える。
 *
 * - 通常の共有URL（/spreadsheets/d/{id}/edit#gid=0）は export?format=csv に変換する。
 * - 「ウェブに公開」のURL（/d/e/2PACX-.../pub?output=csv）はそのまま使う。
 * - Google ドライブに置いた CSV ファイル（drive.google.com/file/d/{id}/view）は
 *   uc?export=download で本体を取る。スプレッドシートに変換しなくても登録できるようにするため。
 *
 * いずれも「リンクを知っている全員が閲覧可」か「ウェブに公開」でないと
 * Google のログイン画面（HTML）が返ってくる。
 */
export function toCsvUrl(sheetUrl: string): string | null {
  const url = sheetUrl.trim();
  if (!url) return null;

  const driveMatch =
    url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9-_]+)/) ??
    url.match(/drive\.google\.com\/(?:open|uc)\?(?:.*&)?id=([a-zA-Z0-9-_]+)/);
  if (driveMatch) {
    return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
  }

  if (/\/spreadsheets\/d\/e\//.test(url)) {
    // 公開URL。output=csv が無ければ付ける
    try {
      const u = new URL(url);
      if (!u.searchParams.get("output")) u.searchParams.set("output", "csv");
      return u.toString();
    } catch {
      return null;
    }
  }

  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return null;
  const id = idMatch[1];

  const gidMatch = url.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";

  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

/** RFC4180 風の CSV を配列にする（引用符・改行入りセル対応） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

export type SheetData = { headers: string[]; rows: Record<string, string>[] };

/** シートを取りに行き、見出し → 値 の配列にして返す。失敗時は日本語の Error を投げる */
export async function fetchSheet(sheetUrl: string): Promise<SheetData> {
  const csvUrl = toCsvUrl(sheetUrl);
  if (!csvUrl) {
    throw new Error(
      "スプレッドシートのURLとして読み取れません。Google スプレッドシートの共有URLか、Google ドライブ上の CSV ファイルのリンクを貼ってください",
    );
  }

  let res: Response;
  try {
    res = await fetch(csvUrl, { redirect: "follow", cache: "no-store" });
  } catch {
    throw new Error("スプレッドシートに接続できませんでした");
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || contentType.includes("text/html")) {
    throw new Error(
      "スプレッドシートを読めませんでした。共有設定を「リンクを知っている全員（閲覧者）」にしてください",
    );
  }
  const text = await res.text();
  // ドライブのファイルは CSV でも application/octet-stream で返るので Content-Type では判定できない。
  // xlsx は ZIP なので先頭が "PK" になる。それで見分ける
  if (text.startsWith("PK\u0003\u0004") || /spreadsheetml/.test(contentType)) {
    throw new Error(
      "このファイルは CSV ではありません（Excel 形式など）。Google スプレッドシートで開いて共有するか、CSV で保存し直してください",
    );
  }
  const table = parseCsv(text);
  if (table.length === 0) throw new Error("シートが空です");

  const headers = table[0].map((h, i) => (h.trim() ? h.trim() : `列${i + 1}`));
  const rows = table.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (r[i] ?? "").trim();
    });
    return obj;
  });
  return { headers, rows };
}

/**
 * 見出しから対応付けを推測する。管理画面の初期値に使うだけで、最終的には人が確認する。
 */
export function guessColumnMap(headers: string[]): ColumnMap {
  const rules: Record<keyof ColumnMap, RegExp> = {
    companyName: /会社|企業|法人|社名|company/i,
    phone: /電話|tel|phone/i,
    address: /住所|所在地|address/i,
    contactName: /担当|代表|氏名|名前|contact/i,
    sheetNote: /備考|メモ|note|remarks/i,
  };
  const map: ColumnMap = {};
  for (const field of COLUMN_FIELDS) {
    const hit = headers.find((h) => rules[field.key].test(h));
    if (hit) map[field.key] = hit;
  }
  return map;
}

function normalizeKeyPart(s: string): string {
  return s.replace(/[\s　\-‐−ー()（）]/g, "").toLowerCase();
}

/**
 * シートの1行を会社として同定するキー。会社名＋電話番号。
 * 行番号にすると、シートに1行挿入しただけで全社の対応状況がずれる。
 */
function rowKeyOf(companyName: string, phone: string): string {
  return `${normalizeKeyPart(companyName)}|${normalizeKeyPart(phone)}`;
}

// ---------------------------------------------------------------------------
// 取り込み
// ---------------------------------------------------------------------------

export type SyncResult = { inserted: number; updated: number; removed: number; total: number };

/**
 * シートを読み直して approach_companies に反映する。
 *
 * - 新しい行は追加、既存の行は会社情報だけ上書き（担当・手段・状況は残す）
 * - シートから消えた行は removed_at を立てて隠す（履歴は消さない）。戻ってきたら復活
 */
export async function syncList(listId: string): Promise<SyncResult> {
  await ensureApproachTables();
  const listRes = await pool.query(`SELECT sheet_url, column_map FROM approach_lists WHERE id = $1;`, [listId]);
  const list = listRes.rows[0] as { sheet_url: string; column_map: ColumnMap } | undefined;
  if (!list) throw new Error("リストが見つかりません");

  const map = list.column_map ?? {};
  if (!map.companyName) throw new Error("会社名の列が設定されていません。管理画面で列の対応付けをしてください");

  let sheet: SheetData;
  try {
    sheet = await fetchSheet(list.sheet_url);
  } catch (e) {
    await pool.query(`UPDATE approach_lists SET last_sync_error = $2, updated_at = NOW() WHERE id = $1;`, [
      listId,
      (e as Error).message,
    ]);
    throw e;
  }

  const pick = (row: Record<string, string>, key: keyof ColumnMap): string | null => {
    const h = map[key];
    if (!h) return null;
    const v = row[h] ?? "";
    return v.trim() ? v.trim() : null;
  };

  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;
  let removed = 0;
  try {
    await client.query("BEGIN");
    const seen = new Set<string>();
    let rowNo = 0;

    for (const row of sheet.rows) {
      const companyName = pick(row, "companyName");
      if (!companyName) continue;
      const phone = pick(row, "phone");
      const key = rowKeyOf(companyName, phone ?? "");
      if (seen.has(key)) continue; // 同じ会社が2行あっても1件にする
      seen.add(key);
      rowNo += 1;

      const res = await client.query(
        `INSERT INTO approach_companies
          (id, list_id, row_key, company_name, phone, address, contact_name, sheet_note, raw, sheet_row)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
         ON CONFLICT (list_id, row_key) DO UPDATE SET
           company_name = EXCLUDED.company_name,
           phone = EXCLUDED.phone,
           address = EXCLUDED.address,
           contact_name = EXCLUDED.contact_name,
           sheet_note = EXCLUDED.sheet_note,
           raw = EXCLUDED.raw,
           sheet_row = EXCLUDED.sheet_row,
           removed_at = NULL,
           updated_at = NOW()
         RETURNING (xmax = 0) AS inserted;`,
        [
          randomUUID(),
          listId,
          key,
          companyName,
          phone,
          pick(row, "address"),
          pick(row, "contactName"),
          pick(row, "sheetNote"),
          JSON.stringify(row),
          rowNo,
        ],
      );
      if (res.rows[0]?.inserted) inserted++;
      else updated++;
    }

    const keys = [...seen];
    const removedRes = await client.query(
      `UPDATE approach_companies SET removed_at = NOW(), updated_at = NOW()
       WHERE list_id = $1 AND removed_at IS NULL AND NOT (row_key = ANY($2::text[]))
       RETURNING id;`,
      [listId, keys],
    );
    removed = removedRes.rowCount ?? 0;

    await client.query(
      `UPDATE approach_lists SET last_synced_at = NOW(), last_sync_error = NULL, updated_at = NOW() WHERE id = $1;`,
      [listId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  return { inserted, updated, removed, total: inserted + updated };
}

// ---------------------------------------------------------------------------
// 読み出し
// ---------------------------------------------------------------------------

const LIST_SELECT = `
  SELECT
    l.id,
    l.industry_id AS "industryId",
    i.name AS "industryName",
    l.prefecture,
    l.name,
    l.sheet_url AS "sheetUrl",
    l.column_map AS "columnMap",
    l.last_synced_at AS "lastSyncedAt",
    l.last_sync_error AS "lastSyncError",
    COALESCE(c.total, 0)::int AS "companyCount",
    COALESCE(c.untouched, 0)::int AS "untouchedCount",
    COALESCE(c.appointments, 0)::int AS "appointmentCount"
  FROM approach_lists l
  JOIN approach_industries i ON i.id = l.industry_id
  LEFT JOIN (
    SELECT list_id,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE ${UNTOUCHED_SQL}) AS untouched,
      COUNT(*) FILTER (WHERE ${APPOINTED_SQL}) AS appointments
    FROM approach_companies WHERE removed_at IS NULL GROUP BY list_id
  ) c ON c.list_id = l.id
`;

export async function listIndustries(): Promise<Industry[]> {
  await ensureApproachTables();
  const res = await pool.query(`
    SELECT
      i.id, i.name, i.sort_order AS "sortOrder",
      COUNT(DISTINCT l.id)::int AS "listCount",
      COUNT(c.id) FILTER (WHERE c.removed_at IS NULL)::int AS "companyCount",
      COUNT(c.id) FILTER (WHERE c.removed_at IS NULL AND c.tel_status = '未対応' AND c.dm_status = '未送信' AND c.letter_status = '未送付')::int AS "untouchedCount"
    FROM approach_industries i
    LEFT JOIN approach_lists l ON l.industry_id = i.id
    LEFT JOIN approach_companies c ON c.list_id = l.id
    GROUP BY i.id
    ORDER BY i.sort_order, i.created_at;`);
  return res.rows as Industry[];
}

export async function listLists(industryId?: string): Promise<ApproachList[]> {
  await ensureApproachTables();
  const where = industryId ? "WHERE l.industry_id = $1" : "";
  const res = await pool.query(`${LIST_SELECT} ${where} ORDER BY i.sort_order, l.prefecture, l.created_at;`, industryId ? [industryId] : []);
  return res.rows as ApproachList[];
}

export async function getList(listId: string): Promise<ApproachList | null> {
  await ensureApproachTables();
  const res = await pool.query(`${LIST_SELECT} WHERE l.id = $1;`, [listId]);
  return (res.rows[0] as ApproachList) ?? null;
}

/** リストの会社一覧。最後に動かしたものを上に、まだ触っていないものはその下でシートの行順（No.順）で */
export async function listCompanies(listId: string): Promise<Company[]> {
  const res = await pool.query(
    `SELECT
      c.id, c.list_id AS "listId", c.sheet_row AS "no", c.company_name AS "companyName", c.phone, c.address,
      c.contact_name AS "contactName", c.sheet_note AS "sheetNote", c.raw,
      c.assignee_id AS "assigneeId", COALESCE(NULLIF(a.display_name, ''), a.login_id) AS "assigneeName",
      c.tel_status AS "telStatus", c.dm_status AS "dmStatus", c.letter_status AS "letterStatus", c.memo,
      c.last_action_at AS "lastActionAt", c.last_action_by AS "lastActionBy",
      COALESCE(NULLIF(b.display_name, ''), b.login_id) AS "lastActionByName",
      c.created_at AS "createdAt"
    FROM approach_companies c
    LEFT JOIN igos_users a ON a.login_id = c.assignee_id
    LEFT JOIN igos_users b ON b.login_id = c.last_action_by
    WHERE c.list_id = $1 AND c.removed_at IS NULL
    ORDER BY c.last_action_at DESC NULLS LAST, c.sheet_row ASC NULLS LAST, c.company_name;`,
    [listId],
  );
  type Row = Omit<Company, "statuses"> & { telStatus: string; dmStatus: string; letterStatus: string };
  return (res.rows as Row[]).map(({ telStatus, dmStatus, letterStatus, ...rest }) => ({
    ...rest,
    statuses: {
      テレアポ: toStatus("テレアポ", telStatus),
      DM: toStatus("DM", dmStatus),
      手紙: toStatus("手紙", letterStatus),
    },
  }));
}

// ---------------------------------------------------------------------------
// 更新
// ---------------------------------------------------------------------------

export type CompanyPatch = {
  assigneeId?: string | null;
  /** 手段ごとの結果。渡した手段だけ変える */
  statuses?: Partial<ChannelStatuses>;
  memo?: string | null;
};

/**
 * 担当・手段ごとの結果・メモを更新する。
 * 結果が変わった手段ごとに履歴（approach_actions）を1行残し、
 * 「最後に動かした人・日時」を更新する。担当が空なら操作した人を担当にする。
 */
export async function updateCompany(companyId: string, actorId: string, patch: CompanyPatch): Promise<void> {
  const cur = await pool.query(
    `SELECT list_id, assignee_id, tel_status, dm_status, letter_status, memo
     FROM approach_companies WHERE id = $1 AND removed_at IS NULL;`,
    [companyId],
  );
  const row = cur.rows[0] as
    | {
        list_id: string;
        assignee_id: string | null;
        tel_status: string;
        dm_status: string;
        letter_status: string;
        memo: string | null;
      }
    | undefined;
  if (!row) throw new Error("会社が見つかりません");

  const current: ChannelStatuses = {
    テレアポ: toStatus("テレアポ", row.tel_status),
    DM: toStatus("DM", row.dm_status),
    手紙: toStatus("手紙", row.letter_status),
  };
  const next: ChannelStatuses = { ...current };
  const changed: ApproachChannel[] = [];
  for (const ch of APPROACH_CHANNELS) {
    const v = patch.statuses?.[ch];
    if (v === undefined) continue;
    const st: ApproachStatus = toStatus(ch, v);
    if (st !== current[ch]) {
      next[ch] = st;
      changed.push(ch);
    }
  }

  const nextMemo = patch.memo === undefined ? row.memo : patch.memo;
  const actionHappened = changed.length > 0;

  let nextAssignee = patch.assigneeId === undefined ? row.assignee_id : patch.assigneeId;
  if (actionHappened && !nextAssignee) nextAssignee = actorId;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE approach_companies SET
         assignee_id = $2, tel_status = $3, dm_status = $4, letter_status = $5, memo = $6,
         last_action_at = CASE WHEN $7 THEN NOW() ELSE last_action_at END,
         last_action_by = CASE WHEN $7 THEN $8 ELSE last_action_by END,
         updated_at = NOW()
       WHERE id = $1;`,
      [companyId, nextAssignee, next.テレアポ, next.DM, next.手紙, nextMemo, actionHappened, actorId],
    );
    for (const ch of changed) {
      await client.query(
        `INSERT INTO approach_actions (id, company_id, list_id, actor_id, channel, status, memo)
         VALUES ($1, $2, $3, $4, $5, $6, $7);`,
        [randomUUID(), companyId, row.list_id, actorId, ch, next[ch], nextMemo],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// 営業別サマリー
// ---------------------------------------------------------------------------

/** 期間の下限（JST）。全期間は null */
function rangeSql(range: SummaryRange): string {
  switch (range) {
    case "today":
      return `a.created_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo'`;
    case "week":
      return `a.created_at >= date_trunc('week', NOW() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo'`;
    case "month":
      return `a.created_at >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo'`;
    default:
      return "TRUE";
  }
}

/** 期間の開始日・終了日（JST, yyyy-mm-dd）。全期間は最初の履歴の日から */
async function rangeDates(range: SummaryRange): Promise<{ from: string; to: string }> {
  const res = await pool.query(`
    SELECT
      to_char((NOW() AT TIME ZONE 'Asia/Tokyo')::date, 'YYYY-MM-DD') AS today,
      to_char(date_trunc('week', NOW() AT TIME ZONE 'Asia/Tokyo')::date, 'YYYY-MM-DD') AS week,
      to_char(date_trunc('month', NOW() AT TIME ZONE 'Asia/Tokyo')::date, 'YYYY-MM-DD') AS month,
      to_char(COALESCE((SELECT MIN(created_at) FROM approach_actions) AT TIME ZONE 'Asia/Tokyo', NOW() AT TIME ZONE 'Asia/Tokyo')::date, 'YYYY-MM-DD') AS first;`);
  const r = res.rows[0] as { today: string; week: string; month: string; first: string };
  const from = range === "today" ? r.today : range === "week" ? r.week : range === "month" ? r.month : r.first;
  return { from, to: r.today };
}

/**
 * 営業別サマリー。期間内の履歴を読み、人ごと・手段ごと・日ごとに集計する。
 * 集計の定義は approach-types.ts の aggregateActions を参照。
 */
export async function salesSummary(range: SummaryRange): Promise<SummaryData & { from: string; to: string }> {
  await ensureApproachTables();
  const { from, to } = await rangeDates(range);
  const res = await pool.query(
    `SELECT
      a.actor_id AS "actorId",
      COALESCE(NULLIF(u.display_name, ''), a.actor_id) AS "actorName",
      a.company_id AS "companyId",
      a.channel, a.status,
      to_char(a.created_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS date
    FROM approach_actions a
    LEFT JOIN igos_users u ON u.login_id = a.actor_id
    WHERE ${rangeSql(range)} AND a.channel IN ('テレアポ', 'DM', '手紙')
    ORDER BY a.created_at;`,
  );
  const rows = (res.rows as RawAction[]).filter((r) => APPROACH_CHANNELS.includes(r.channel));
  return { ...aggregateActions(rows, from, to), from, to };
}

/** 直近の操作履歴（新しい順） */
export async function recentActions(range: SummaryRange, limit = 100): Promise<ApproachAction[]> {
  await ensureApproachTables();
  const res = await pool.query(
    `SELECT
      a.id, a.company_id AS "companyId", c.company_name AS "companyName",
      a.list_id AS "listId", i.name || ' / ' || l.prefecture AS "listLabel",
      a.actor_id AS "actorId", COALESCE(NULLIF(u.display_name, ''), a.actor_id) AS "actorName",
      a.channel, a.status, a.memo, a.created_at AS "createdAt"
    FROM approach_actions a
    JOIN approach_companies c ON c.id = a.company_id
    JOIN approach_lists l ON l.id = a.list_id
    JOIN approach_industries i ON i.id = l.industry_id
    LEFT JOIN igos_users u ON u.login_id = a.actor_id
    WHERE ${rangeSql(range)} AND a.channel IN ('テレアポ', 'DM', '手紙')
    ORDER BY a.created_at DESC
    LIMIT $1;`,
    [limit],
  );
  return res.rows as ApproachAction[];
}
