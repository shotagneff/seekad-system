// アプローチリストのトップ。業界と、その下のリスト（業界×都道府県）を一括で返す。
import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { listIndustries, listLists } from "@/lib/approach";

export const runtime = "nodejs";

export async function GET() {
  if (!hasDatabase()) return NextResponse.json({ ok: true, industries: [], lists: [] });
  try {
    const [industries, lists] = await Promise.all([listIndustries(), listLists()]);
    return NextResponse.json({ ok: true, industries, lists });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
