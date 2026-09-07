// 会社1件の担当・手段・状況・メモを更新する。操作した人は Cookie から取る。
import { NextRequest, NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { getLoginId, updateCompany } from "@/lib/approach";
import { toChannel, toStatus } from "@/lib/approach-types";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!hasDatabase()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 500 });
  const loginId = await getLoginId(req);
  if (!loginId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => ({}))) as {
    assigneeId?: string | null;
    channel?: string;
    status?: string;
    memo?: string | null;
  };

  try {
    await updateCompany(id, loginId, {
      assigneeId: body.assigneeId === undefined ? undefined : body.assigneeId || null,
      channel: body.channel === undefined ? undefined : toChannel(body.channel),
      status: body.status === undefined ? undefined : toStatus(body.status),
      memo: body.memo === undefined ? undefined : String(body.memo ?? "").trim() || null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
