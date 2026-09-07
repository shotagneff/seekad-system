// スプレッドシートを読み直して会社一覧を更新する。
//
// 誰でも押せる。追加・上書きだけで、担当・状況・履歴は消さないため。
import { NextRequest, NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { getLoginId, syncList } from "@/lib/approach";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!hasDatabase()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 500 });
  const loginId = await getLoginId(req);
  if (!loginId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const result = await syncList(id);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
