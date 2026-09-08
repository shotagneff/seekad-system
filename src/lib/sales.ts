// アポ獲得管理のDBアクセス。
//
// 型・区分・日付計算は sales-types.ts にある（画面から import されるため）。
// ここはサーバー側でしか読まれない。

import { pool } from "@/lib/db";
import {
  PHASE_MAKES_CUSTOMER,
  PHASE_MAKES_DEAL,
  WIN_PROBABILITY,
  monthsBetween,
  todayJst,
  type Customer,
  type Deal,
  type DealPhase,
  type Lead,
  type LeadPhase,
  type SalesData,
} from "@/lib/sales-types";

export * from "@/lib/sales-types";

// ---------------------------------------------------------------------------
// 読み出し
// ---------------------------------------------------------------------------

/**
 * 担当者の候補にする登録ユーザーの表示名（有効なユーザーだけ）。
 * ユーザー管理で追加した人がそのままアポ獲得管理の担当に出るようにする。
 * 空白は sales-performance 側で落として案件データの表記に揃える。
 */
export async function listRegisteredOwners(): Promise<string[]> {
  const res = await pool.query<{ display_name: string }>(
    `SELECT display_name FROM igos_users
     WHERE active = TRUE AND NULLIF(display_name, '') IS NOT NULL
     ORDER BY login_id;`
  );
  return res.rows.map((r) => r.display_name);
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** DATE 型を YYYY-MM-DD に。時刻やタイムゾーンで日がずれないよう自前で組む */
function toDateString(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return null;
}

function toLead(r: any, dealIds: Set<number>): Lead {
  return {
    id: Number(r.id),
    monthLabel: r.month_label,
    company: r.company,
    owner: r.owner,
    phase: (r.phase ?? "リード") as LeadPhase,
    grade: r.grade,
    registeredOn: toDateString(r.registered_on),
    ceoName: r.ceo_name,
    contactName: r.contact_name,
    contactTitle: r.contact_title,
    phone: r.phone,
    email: r.email,
    website: r.website,
    industry: r.industry,
    employeeSize: r.employee_size,
    prefecture: r.prefecture,
    nextAction: r.next_action,
    nextActionOn: toDateString(r.next_action_on),
    nextActionTime: r.next_action_time ?? null,
    leadSource: r.lead_source,
    referrer: r.referrer,
    note: r.note ?? null,
    updatedOn: toDateString(r.updated_on),
    hasDeal: dealIds.has(Number(r.id)),
  };
}

function toDeal(r: any, leadIds: Set<number>, customerByDeal: Map<number, string>): Deal {
  const monthlyFee = Number(r.monthly_fee ?? 0);
  const oneTimeFee = Number(r.one_time_fee ?? 0);
  return {
    id: Number(r.id),
    company: r.company,
    owner: r.owner,
    phase: (r.phase ?? "提案") as DealPhase,
    winProbability: r.win_probability === null ? null : Number(r.win_probability),
    nextAction: r.next_action,
    nextActionOn: toDateString(r.next_action_on),
    proposedOn: toDateString(r.proposed_on),
    monthlyFee,
    oneTimeFee,
    competitor: r.competitor,
    service: r.service,
    referrer: r.referrer,
    lostReason: r.lost_reason,
    note: r.note ?? null,
    wonOn: toDateString(r.won_on),
    lostOn: toDateString(r.lost_on),
    createdOn: toDateString(r.created_on),
    updatedOn: toDateString(r.updated_on),
    annualTotal: monthlyFee * 12 + oneTimeFee,
    hasLead: leadIds.has(Number(r.id)),
    customerId: customerByDeal.get(Number(r.id)) ?? null,
  };
}

function toCustomer(r: any, dealById: Map<number, Deal>, today: string): Customer {
  const monthlyFee = Number(r.monthly_fee ?? 0);
  const monthsElapsed = monthsBetween(toDateString(r.started_on), today);
  const additionalRevenue = r.deal_id ? (dealById.get(Number(r.deal_id))?.oneTimeFee ?? 0) : 0;
  const cumulativeMonthly = monthlyFee * monthsElapsed;
  return {
    id: r.id,
    company: r.company,
    owner: r.owner,
    status: r.status ?? "稼働",
    startedOn: toDateString(r.started_on),
    monthlyFee,
    ceoName: r.ceo_name,
    industry: r.industry,
    employeeSize: r.employee_size,
    location: r.location,
    note: r.note,
    dealId: r.deal_id === null ? null : Number(r.deal_id),
    createdOn: toDateString(r.created_on),
    updatedOn: toDateString(r.updated_on),
    monthsElapsed,
    annualValue: monthlyFee * 12,
    cumulativeMonthly,
    additionalRevenue,
    ltv: cumulativeMonthly + additionalRevenue,
  };
}

/** 3テーブルをまとめて読む。互いを参照して計算するため個別に引くと足りない */
export async function getSalesData(): Promise<SalesData> {
  const [leadRows, dealRows, customerRows] = await Promise.all([
    pool.query("SELECT * FROM sales_leads ORDER BY id DESC"),
    pool.query("SELECT * FROM sales_deals ORDER BY COALESCE(proposed_on, created_on) DESC NULLS LAST, id DESC"),
    pool.query("SELECT * FROM sales_customers ORDER BY started_on DESC NULLS LAST, id DESC"),
  ]);

  const today = todayJst();
  const leadIds = new Set(leadRows.rows.map((r) => Number(r.id)));
  const dealIds = new Set(dealRows.rows.map((r) => Number(r.id)));
  const customerByDeal = new Map<number, string>();
  for (const c of customerRows.rows) {
    if (c.deal_id !== null) customerByDeal.set(Number(c.deal_id), c.id);
  }

  const deals = dealRows.rows.map((r) => toDeal(r, leadIds, customerByDeal));
  const dealById = new Map(deals.map((d) => [d.id, d]));

  return {
    leads: leadRows.rows.map((r) => toLead(r, dealIds)),
    deals,
    customers: customerRows.rows.map((r) => toCustomer(r, dealById, today)),
  };
}

// ---------------------------------------------------------------------------
// 書き込み（＝シートで手作業だった連動をここで再現する）
// ---------------------------------------------------------------------------

const LEAD_FIELDS: Record<string, string> = {
  company: "company",
  owner: "owner",
  phase: "phase",
  grade: "grade",
  registeredOn: "registered_on",
  ceoName: "ceo_name",
  contactName: "contact_name",
  contactTitle: "contact_title",
  phone: "phone",
  email: "email",
  website: "website",
  industry: "industry",
  employeeSize: "employee_size",
  prefecture: "prefecture",
  nextAction: "next_action",
  nextActionOn: "next_action_on",
  nextActionTime: "next_action_time",
  leadSource: "lead_source",
  referrer: "referrer",
  note: "note",
};

const DEAL_FIELDS: Record<string, string> = {
  company: "company",
  owner: "owner",
  phase: "phase",
  nextAction: "next_action",
  nextActionOn: "next_action_on",
  proposedOn: "proposed_on",
  monthlyFee: "monthly_fee",
  oneTimeFee: "one_time_fee",
  competitor: "competitor",
  service: "service",
  referrer: "referrer",
  lostReason: "lost_reason",
  note: "note",
  wonOn: "won_on",
  lostOn: "lost_on",
};

const CUSTOMER_FIELDS: Record<string, string> = {
  company: "company",
  owner: "owner",
  status: "status",
  startedOn: "started_on",
  monthlyFee: "monthly_fee",
  ceoName: "ceo_name",
  industry: "industry",
  employeeSize: "employee_size",
  location: "location",
  note: "note",
};

function buildSet(patch: Record<string, unknown>, map: Record<string, string>) {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(map)) {
    if (!(key in patch)) continue;
    values.push(patch[key] === "" ? null : patch[key]);
    sets.push(`${column} = $${values.length}`);
  }
  return { sets, values };
}

/** 次に使うリードの案件ID。シートと同じく通番 */
async function nextLeadId(): Promise<number> {
  const r = await pool.query("SELECT COALESCE(MAX(id), 0) + 1 AS next FROM sales_leads");
  return Number(r.rows[0].next);
}

/**
 * 顧客IDを採番する。C + 契約開始月 + 通番4桁。
 * シートの採番（C202604-0023 …）をそのまま引き継ぐ。
 * 通番は月ごとではなく全体で連番。
 */
async function nextCustomerId(startedOn: string): Promise<string> {
  const r = await pool.query(
    `SELECT COALESCE(MAX(SUBSTRING(id FROM '[0-9]{4}$')::int), 0) + 1 AS next FROM sales_customers`
  );
  const seq = String(Number(r.rows[0].next)).padStart(4, "0");
  return `C${startedOn.slice(0, 4)}${startedOn.slice(5, 7)}-${seq}`;
}

export async function createLead(patch: Record<string, unknown>): Promise<number> {
  const id = await nextLeadId();
  const today = todayJst();
  const registeredOn = (patch.registeredOn as string) || today;
  await pool.query(
    `INSERT INTO sales_leads (id, month_label, phase, registered_on, updated_on)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, `${Number(registeredOn.slice(5, 7))}月`, (patch.phase as string) ?? "リード", registeredOn, today]
  );
  await updateLead(id, { ...patch, registeredOn });
  return id;
}

/**
 * リードを更新する。
 *
 * フェーズを「案件化済」にしたら案件を作る。
 * シートでは人が案件管理シートに手でコピペしていた工程。
 * 忘れると案件が消えるので、ここで自動にする。
 */
export async function updateLead(id: number, patch: Record<string, unknown>): Promise<void> {
  const { sets, values } = buildSet(patch, LEAD_FIELDS);
  if (sets.length) {
    values.push(todayJst());
    sets.push(`updated_on = $${values.length}`);
    values.push(id);
    await pool.query(`UPDATE sales_leads SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
  }

  if (patch.phase === PHASE_MAKES_DEAL) {
    await ensureDealForLead(id);
  }
}

/** リードから案件を起こす。既にあれば何もしない */
async function ensureDealForLead(leadId: number): Promise<void> {
  const exists = await pool.query("SELECT 1 FROM sales_deals WHERE id = $1", [leadId]);
  if (exists.rowCount) return;

  const lead = await pool.query("SELECT * FROM sales_leads WHERE id = $1", [leadId]);
  if (!lead.rowCount) return;
  const l = lead.rows[0];
  const today = todayJst();

  await pool.query(
    `INSERT INTO sales_deals
       (id, company, owner, phase, win_probability, next_action, next_action_on,
        proposed_on, referrer, note, created_on, updated_on)
     VALUES ($1,$2,$3,'提案',$4,$5,$6,$7,$8,$9,$10,$10)`,
    [leadId, l.company, l.owner, WIN_PROBABILITY["提案"], l.next_action, l.next_action_on, today, l.referrer,
     // メモも一緒に運ぶ。シートでは案件シートへ手でコピペしていた欄
     l.note ?? null, today]
  );
}

/**
 * 案件を更新する。
 *
 * ・フェーズを変えたら受注確度を合わせる（人が入れると受注なのに0%が残る）
 * ・受注にしたら受注日を入れて顧客を作る
 * ・失注にしたら失注日を入れる。失注一覧はこのフェーズを絞って出しているだけ
 */
export async function updateDeal(id: number, patch: Record<string, unknown>): Promise<void> {
  const today = todayJst();
  const next: Record<string, unknown> = { ...patch };

  if (typeof patch.phase === "string" && patch.phase in WIN_PROBABILITY) {
    const phase = patch.phase as DealPhase;
    const current = await pool.query("SELECT won_on, lost_on FROM sales_deals WHERE id = $1", [id]);
    const row = current.rows[0];

    // 受注日・失注日が空なら今日を入れる。既に入っていれば触らない
    if (phase === "受注" && !row?.won_on && next.wonOn === undefined) next.wonOn = today;
    if (phase === "失注" && !row?.lost_on && next.lostOn === undefined) next.lostOn = today;
  }

  const { sets, values } = buildSet(next, DEAL_FIELDS);
  if (typeof patch.phase === "string" && patch.phase in WIN_PROBABILITY) {
    values.push(WIN_PROBABILITY[patch.phase as DealPhase]);
    sets.push(`win_probability = $${values.length}`);
  }
  if (sets.length) {
    values.push(today);
    sets.push(`updated_on = $${values.length}`);
    values.push(id);
    await pool.query(`UPDATE sales_deals SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
  }

  if (patch.phase === PHASE_MAKES_CUSTOMER) {
    await ensureCustomerForDeal(id);
  }
}

/** 受注した案件から顧客を起こす。既にあれば何もしない */
async function ensureCustomerForDeal(dealId: number): Promise<void> {
  const exists = await pool.query("SELECT 1 FROM sales_customers WHERE deal_id = $1", [dealId]);
  if (exists.rowCount) return;

  const deal = await pool.query("SELECT * FROM sales_deals WHERE id = $1", [dealId]);
  if (!deal.rowCount) return;
  const d = deal.rows[0];

  // 代表者名・業種・従業員規模はリード側にしかない。受注時点で引き継ぐ
  const lead = await pool.query("SELECT * FROM sales_leads WHERE id = $1", [dealId]);
  const l = lead.rows[0] ?? {};

  const startedOn = toDateString(d.won_on) ?? todayJst();
  const id = await nextCustomerId(startedOn);

  await pool.query(
    `INSERT INTO sales_customers
       (id, company, owner, status, started_on, monthly_fee, ceo_name, industry,
        employee_size, location, deal_id, created_on, updated_on)
     VALUES ($1,$2,$3,'稼働',$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
    [id, d.company, d.owner, startedOn, d.monthly_fee, l.ceo_name ?? null, l.industry ?? null,
     l.employee_size ?? null, l.prefecture ?? null, dealId, todayJst()]
  );
}

export async function updateCustomer(id: string, patch: Record<string, unknown>): Promise<void> {
  const { sets, values } = buildSet(patch, CUSTOMER_FIELDS);
  if (!sets.length) return;
  values.push(todayJst());
  sets.push(`updated_on = $${values.length}`);
  values.push(id);
  await pool.query(`UPDATE sales_customers SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
}

export async function deleteLead(id: number): Promise<void> {
  await pool.query("DELETE FROM sales_leads WHERE id = $1", [id]);
}
