// 営業別サマリー。期間（today / week / month / all）ごとの件数と直近の履歴。
import { NextRequest, NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { recentActions, salesSummary } from "@/lib/approach";
import type { SummaryRange } from "@/lib/approach-types";

export const runtime = "nodejs";

const RANGES: SummaryRange[] = ["today", "week", "month", "all"];

export async function GET(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ ok: true, rows: [], actions: [] });
  const raw = req.nextUrl.searchParams.get("range") ?? "today";
  const range: SummaryRange = RANGES.includes(raw as SummaryRange) ? (raw as SummaryRange) : "today";
  try {
    const [rows, actions] = await Promise.all([salesSummary(range), recentActions(range)]);
    return NextResponse.json({ ok: true, range, rows, actions });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
