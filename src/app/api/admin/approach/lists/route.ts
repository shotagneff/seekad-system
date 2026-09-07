// リスト（業界×都道府県 = スプレッドシート1枚）の登録・変更・削除（管理者）。
//
// 登録したらそのまま取り込みまで行う。登録だけして空のリストが並ぶと、
// 「登録したのに出ない」と受け取られる。
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { pool, hasDatabase } from "@/lib/db";
import { ensureApproachTables } from "@/lib/schema";
import { syncList } from "@/lib/approach";
import { COLUMN_FIELDS, type ColumnMap } from "@/lib/approach-types";

export const runtime = "nodejs";

function cleanColumnMap(input: unknown): ColumnMap {
  const map: ColumnMap = {};
  if (!input || typeof input !== "object") return map;
  const obj = input as Record<string, unknown>;
  for (const f of COLUMN_FIELDS) {
    const v = obj[f.key];
    if (typeof v === "string" && v.trim()) map[f.key] = v.trim();
  }
  return map;
}

export async function POST(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 500 });
  await ensureApproachTables();
  const body = (await req.json().catch(() => ({}))) as {
    industryId?: string;
    prefecture?: string;
    name?: string;
    sheetUrl?: string;
    columnMap?: unknown;
  };
  const industryId = String(body.industryId ?? "").trim();
  const prefecture = String(body.prefecture ?? "").trim();
  const sheetUrl = String(body.sheetUrl ?? "").trim();
  const columnMap = cleanColumnMap(body.columnMap);
  if (!industryId || !prefecture || !sheetUrl) {
    return NextResponse.json({ ok: false, error: "業界・都道府県・スプレッドシートURLは必須です" }, { status: 400 });
  }
  if (!columnMap.companyName) {
    return NextResponse.json({ ok: false, error: "会社名の列を選んでください" }, { status: 400 });
  }

  const id = randomUUID();
  await pool.query(
    `INSERT INTO approach_lists (id, industry_id, prefecture, name, sheet_url, column_map)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb);`,
    [id, industryId, prefecture, String(body.name ?? "").trim() || null, sheetUrl, JSON.stringify(columnMap)],
  );

  try {
    const result = await syncList(id);
    return NextResponse.json({ ok: true, id, result });
  } catch (e) {
    // 登録は残す。エラーはリストに表示され、URLや共有設定を直して再取り込みできる
    return NextResponse.json({ ok: true, id, syncError: (e as Error).message });
  }
}

export async function PATCH(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 500 });
  await ensureApproachTables();
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    industryId?: string;
    prefecture?: string;
    name?: string | null;
    sheetUrl?: string;
    columnMap?: unknown;
    resync?: boolean;
  };
  if (!body.id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });

  const sets: string[] = [];
  const values: unknown[] = [body.id];
  const push = (col: string, v: unknown) => {
    values.push(v);
    sets.push(`${col} = $${values.length}`);
  };
  if (body.industryId) push("industry_id", body.industryId);
  if (body.prefecture) push("prefecture", String(body.prefecture).trim());
  if (body.name !== undefined) push("name", String(body.name ?? "").trim() || null);
  if (body.sheetUrl) push("sheet_url", String(body.sheetUrl).trim());
  if (body.columnMap !== undefined) {
    const map = cleanColumnMap(body.columnMap);
    if (!map.companyName) return NextResponse.json({ ok: false, error: "会社名の列を選んでください" }, { status: 400 });
    values.push(JSON.stringify(map));
    sets.push(`column_map = $${values.length}::jsonb`);
  }
  if (sets.length) {
    await pool.query(`UPDATE approach_lists SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1;`, values);
  }

  if (body.resync) {
    try {
      const result = await syncList(body.id);
      return NextResponse.json({ ok: true, result });
    } catch (e) {
      return NextResponse.json({ ok: true, syncError: (e as Error).message });
    }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 500 });
  await ensureApproachTables();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  await pool.query(`DELETE FROM approach_lists WHERE id = $1;`, [id]);
  return NextResponse.json({ ok: true });
}
