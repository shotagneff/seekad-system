// 業界の追加・名前変更・並び替え・削除（管理者）。
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { pool, hasDatabase } from "@/lib/db";
import { ensureApproachTables } from "@/lib/schema";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 500 });
  await ensureApproachTables();
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ ok: false, error: "業界名を入力してください" }, { status: 400 });

  const dup = await pool.query(`SELECT 1 FROM approach_industries WHERE name = $1;`, [name]);
  if (dup.rowCount) return NextResponse.json({ ok: false, error: "同じ名前の業界があります" }, { status: 400 });

  const order = await pool.query(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM approach_industries;`);
  const id = randomUUID();
  await pool.query(`INSERT INTO approach_industries (id, name, sort_order) VALUES ($1, $2, $3);`, [
    id,
    name,
    order.rows[0].next,
  ]);
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 500 });
  await ensureApproachTables();
  const body = (await req.json().catch(() => ({}))) as { id?: string; name?: string; sortOrder?: number };
  if (!body.id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ ok: false, error: "業界名を入力してください" }, { status: 400 });
    await pool.query(`UPDATE approach_industries SET name = $2 WHERE id = $1;`, [body.id, name]);
  }
  if (typeof body.sortOrder === "number") {
    await pool.query(`UPDATE approach_industries SET sort_order = $2 WHERE id = $1;`, [body.id, body.sortOrder]);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 500 });
  await ensureApproachTables();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  // 配下のリスト・会社・履歴も消える（ON DELETE CASCADE）
  await pool.query(`DELETE FROM approach_industries WHERE id = $1;`, [id]);
  return NextResponse.json({ ok: true });
}
