// 会社1件の担当・手段ごとの結果・メモを更新する。操作した人は Cookie から取る。
import { NextRequest, NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { getLoginId, updateCompany } from "@/lib/approach";
import { APPROACH_CHANNELS, toStatus, type ChannelStatuses } from "@/lib/approach-types";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!hasDatabase()) return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 500 });
  const loginId = await getLoginId(req);
  if (!loginId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => ({}))) as {
    assigneeId?: string | null;
    statuses?: Partial<Record<string, string>>;
    memo?: string | null;
  };

  let statuses: Partial<ChannelStatuses> | undefined;
  if (body.statuses && typeof body.statuses === "object") {
    statuses = {};
    for (const ch of APPROACH_CHANNELS) {
      const v = body.statuses[ch];
      if (v !== undefined) statuses[ch] = toStatus(ch, v);
    }
  }

  try {
    await updateCompany(id, loginId, {
      assigneeId: body.assigneeId === undefined ? undefined : body.assigneeId || null,
      statuses,
      memo: body.memo === undefined ? undefined : String(body.memo ?? "").trim() || null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
