// 代表取締役名のカタカナ読みを生成する（管理者）。
//
// GET  … 読みが付いている名前 / まだ付いていない名前の件数
// POST … まだ付いていない名前に読みを付ける。1回あたり数バッチだけ処理して残り件数を返す。
//        （Claude API を何十回も呼ぶと関数のタイムアウトに掛かるので、管理画面側で残りが 0 になるまで繰り返し呼ぶ）
//
// 通常は取り込み（syncList）のたびに自動で付くので、ここを使うのは
// 過去データの一括付与や、API エラーで付かなかったぶんの穴埋め。
import { NextRequest, NextResponse } from "next/server";
import { pool, hasDatabase } from "@/lib/db";
import { ensureApproachTables } from "@/lib/schema";
import { fillMissingKana } from "@/lib/name-kana";

export const runtime = "nodejs";
export const maxDuration = 180;

async function counts() {
  const res = await pool.query(`
    SELECT
      COUNT(DISTINCT c.contact_name)::int AS total,
      COUNT(DISTINCT c.contact_name) FILTER (WHERE k.name IS NOT NULL)::int AS done
    FROM approach_companies c
    LEFT JOIN approach_name_kana k ON k.name = c.contact_name
    WHERE c.contact_name IS NOT NULL AND c.contact_name <> '' AND c.removed_at IS NULL;`);
  const row = res.rows[0] as { total: number; done: number };
  return { total: row.total, done: row.done, remaining: row.total - row.done };
}

export async function GET() {
  if (!hasDatabase()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 500 });
  await ensureApproachTables();
  return NextResponse.json({ ok: true, ...(await counts()) });
}

export async function POST(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 500 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY が設定されていません" }, { status: 500 });
  }
  await ensureApproachTables();
  const body = (await req.json().catch(() => ({}))) as { maxBatches?: number };
  const maxBatches = Math.min(Math.max(Number(body.maxBatches) || 3, 1), 5);
  try {
    const result = await fillMissingKana({ maxBatches });
    return NextResponse.json({ ok: true, result, ...(await counts()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
