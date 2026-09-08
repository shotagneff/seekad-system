import { NextRequest, NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import {
  createLead,
  deleteLead,
  getSalesData,
  listRegisteredOwners,
  updateCustomer,
  updateDeal,
  updateLead,
  DEAL_PHASES,
  LEAD_PHASES,
  CUSTOMER_STATUSES,
} from "@/lib/sales";
import { buildPerformance, orderedOwners } from "@/lib/sales-performance";
import {
  ensureSalesLeadsTable,
  ensureSalesDealsTable,
  ensureSalesCustomersTable,
} from "@/lib/schema";

// アポ獲得管理（リード / 案件 / 顧客）と成績。
//
// 反響リードと同じく、管理者限定にはしない。
// 営業全員が自分の案件を触れないと、結局スプレッドシートに戻ってしまう。
// ログインは proxy.ts で必須になっている。

export const dynamic = "force-dynamic";

function guard() {
  if (!hasDatabase()) {
    return NextResponse.json({ error: "DATABASE_URL が未設定です" }, { status: 503 });
  }
  return null;
}

// テーブル（と後から足した列 next_action_time 等）を保証する。
// 他ルートと同じく、各ハンドラの冒頭で冪等に呼ぶ。
async function ensureSales() {
  await ensureSalesLeadsTable();
  await ensureSalesDealsTable();
  await ensureSalesCustomersTable();
}

export async function GET() {
  const blocked = guard();
  if (blocked) return blocked;
  try {
    await ensureSales();
    const [data, registered] = await Promise.all([getSalesData(), listRegisteredOwners()]);
    const owners = orderedOwners(data, registered);
    return NextResponse.json({ ...data, owners, performance: buildPerformance(data, registered) });
  } catch (e) {
    console.error("[sales] 取得に失敗:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

type Body = {
  kind?: "lead" | "deal" | "customer";
  id?: number | string;
  patch?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  const blocked = guard();
  if (blocked) return blocked;
  try {
    await ensureSales();
    const body = (await req.json()) as Body;
    if (body.kind !== "lead") {
      // 案件と顧客は「リードが案件化した」「案件が受注した」ときに自動で生まれる。
      // 直接作れるようにすると、元のリードが無い行ができて追えなくなる。
      return NextResponse.json(
        { error: "案件・顧客は直接作れません。リードのフェーズを進めてください" },
        { status: 400 }
      );
    }
    const id = await createLead(body.patch ?? {});
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error("[sales] 作成に失敗:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const blocked = guard();
  if (blocked) return blocked;
  try {
    await ensureSales();
    const body = (await req.json()) as Body;
    const patch = body.patch ?? {};
    if (body.id === undefined || body.id === null) {
      return NextResponse.json({ error: "id が必要です" }, { status: 400 });
    }

    // フェーズは決まった値しか受け付けない。
    // 自由に入ると集計（成績）の分母が静かに狂う。
    if (body.kind === "lead" && patch.phase !== undefined) {
      if (!LEAD_PHASES.includes(patch.phase as never)) {
        return NextResponse.json({ error: "フェーズの値が不正です" }, { status: 400 });
      }
    }
    if (body.kind === "deal" && patch.phase !== undefined) {
      if (!DEAL_PHASES.includes(patch.phase as never)) {
        return NextResponse.json({ error: "フェーズの値が不正です" }, { status: 400 });
      }
    }
    if (body.kind === "customer" && patch.status !== undefined) {
      if (!CUSTOMER_STATUSES.includes(patch.status as never)) {
        return NextResponse.json({ error: "ステータスの値が不正です" }, { status: 400 });
      }
    }

    if (body.kind === "lead") await updateLead(Number(body.id), patch);
    else if (body.kind === "deal") await updateDeal(Number(body.id), patch);
    else if (body.kind === "customer") await updateCustomer(String(body.id), patch);
    else return NextResponse.json({ error: "kind が不正です" }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[sales] 更新に失敗:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const blocked = guard();
  if (blocked) return blocked;
  try {
    await ensureSales();
    const { id } = (await req.json()) as { id?: number };
    if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 });
    await deleteLead(Number(id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
