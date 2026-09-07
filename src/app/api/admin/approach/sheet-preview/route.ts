// スプレッドシートURLを受け取り、見出しと先頭数行を返す（列の対応付け画面用）。
import { NextRequest, NextResponse } from "next/server";
import { fetchSheet, guessColumnMap } from "@/lib/approach";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { sheetUrl?: string };
  const sheetUrl = String(body.sheetUrl ?? "").trim();
  if (!sheetUrl) return NextResponse.json({ ok: false, error: "URLを入力してください" }, { status: 400 });
  try {
    const sheet = await fetchSheet(sheetUrl);
    return NextResponse.json({
      ok: true,
      headers: sheet.headers,
      sample: sheet.rows.slice(0, 3),
      rowCount: sheet.rows.length,
      guess: guessColumnMap(sheet.headers),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
