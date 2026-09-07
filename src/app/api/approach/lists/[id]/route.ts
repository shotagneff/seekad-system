// リスト1件（業界×都道府県）と、その会社一覧。
import { NextRequest, NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { getList, listCompanies } from "@/lib/approach";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!hasDatabase()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 500 });
  const { id } = await ctx.params;
  try {
    const list = await getList(id);
    if (!list) return NextResponse.json({ ok: false, error: "リストが見つかりません" }, { status: 404 });
    const companies = await listCompanies(id);
    return NextResponse.json({ ok: true, list, companies });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
