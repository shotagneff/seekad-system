import { NextRequest, NextResponse } from "next/server";
import {
  hasCallforce,
  listLeads,
  listResponders,
  updateLead,
  saveContactNote,
  getLead,
  getContactNote,
  ACQUISITION_CHANNELS,
  CHANNEL_REQUIRED_STATUS,
  LEAD_STATUSES,
  type LeadStatus,
} from "@/lib/callforce";
import { hasDatabase } from "@/lib/db";
import {
  createLeadFromCallforce,
  listRegisteredOwners,
  normalizeOwnerName,
  type CallforceImportResult,
} from "@/lib/sales";

// 反響リード（Callforce のデモ通話・広告フォーム）の一覧と更新。
// データは Callforce 側の Supabase にあり、ここでは持たない。
//
// 管理者限定にはしない。反響は手が空いている人が拾うのが一番早く、
// 担当に指名された人しか見られないと初動が遅れる。
// ただしログインは必須（proxy.ts が /login と /api/auth 以外を保護している）。

export const dynamic = "force-dynamic";

/**
 * 担当の選択肢。Callforce の名簿にユーザー管理の社員を足す。
 *
 * Callforce の名簿（lead_responders）は反響の自動振り分けと通知の宛先なので、
 * 担当を選べるようにするためだけに人を足すと、その人にも反響が振られてしまう。
 * 名簿はそのままにして、ここで社員を足す。
 * 同じ人（空白の有無だけ違う）は Callforce 側の表記を残す。既存の担当の値と揃えるため。
 */
async function listAssigneeOptions(): Promise<string[]> {
  const [responders, owners] = await Promise.all([
    listResponders(),
    hasDatabase()
      ? listRegisteredOwners().catch((e) => {
          console.error("[leads] 社員の名簿の取得に失敗:", e);
          return [] as string[];
        })
      : Promise.resolve([] as string[]),
  ]);
  const seen = new Set(responders.map(normalizeOwnerName));
  const extra = owners.filter((name) => {
    const key = normalizeOwnerName(name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...responders, ...extra];
}

export async function GET() {
  if (!hasCallforce()) {
    return NextResponse.json(
      { error: "CALLFORCE_SUPABASE_URL / CALLFORCE_SUPABASE_SERVICE_KEY が未設定です" },
      { status: 503 }
    );
  }
  try {
    const [leads, responders] = await Promise.all([listLeads(), listAssigneeOptions()]);
    return NextResponse.json({ leads, responders });
  } catch (e) {
    console.error("[leads] 取得に失敗:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!hasCallforce()) {
    return NextResponse.json({ error: "Callforce 未設定" }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    status?: string;
    assignedTo?: string;
    /** 電話番号に紐づくメモ。phoneNumber とセットで送る */
    note?: string;
    phoneNumber?: string;
    /** 次回連絡日（YYYY-MM-DD）。null で解除 */
    nextActionAt?: string | null;
    acquisitionChannel?: string | null;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "本文が読めません" }, { status: 400 });
  }
  if (body.status && !LEAD_STATUSES.includes(body.status as LeadStatus)) {
    return NextResponse.json({ error: "対応状況の値が不正です" }, { status: 400 });
  }
  if (
    body.acquisitionChannel &&
    !ACQUISITION_CHANNELS.includes(body.acquisitionChannel as (typeof ACQUISITION_CHANNELS)[number])
  ) {
    return NextResponse.json({ error: "流入経路の値が不正です" }, { status: 400 });
  }

  // アポ獲得にするには流入経路が要る。
  // 画面側でも止めているが、ここで弾かないと「入力義務」にならない。
  if (body.status === CHANNEL_REQUIRED_STATUS && body.id) {
    const already = body.acquisitionChannel;
    if (already === null || already === "") {
      return NextResponse.json({ error: "アポ獲得にするには流入経路の入力が必要です" }, { status: 400 });
    }
    if (already === undefined) {
      const current = await getLead(body.id);
      if (!current?.acquisitionChannel) {
        return NextResponse.json(
          { error: "アポ獲得にするには流入経路の入力が必要です" },
          { status: 400 }
        );
      }
    }
  }

  try {
    // メモは電話番号に紐づく。1件のリードではなく、その番号に対して保存する
    if (body.note !== undefined) {
      if (!body.phoneNumber) {
        return NextResponse.json({ error: "電話番号が必要です" }, { status: 400 });
      }
      await saveContactNote(body.phoneNumber, body.note);
    }

    if (
      body.status !== undefined ||
      body.assignedTo !== undefined ||
      body.nextActionAt !== undefined ||
      body.acquisitionChannel !== undefined
    ) {
      if (!body.id) {
        return NextResponse.json({ error: "id が必要です" }, { status: 400 });
      }
      await updateLead(body.id, {
        status: body.status as LeadStatus | undefined,
        assignedTo: body.assignedTo,
        nextActionAt: body.nextActionAt,
        acquisitionChannel: body.acquisitionChannel,
      });

      // アポ獲得にしたら、その内容でアポ獲得管理のリードを起こす。
      // これまでは反響リードを見ながら手で打ち直していた。
      // 反響リード側の更新は済んでいるので、こちらが失敗しても 200 で返し、
      // 理由だけ salesLeadError に載せる（画面で赤く出す）。
      if (body.status === CHANNEL_REQUIRED_STATUS) {
        if (!hasDatabase()) {
          return NextResponse.json({ ok: true, salesLeadError: "DATABASE_URL が未設定のためアポ獲得管理に追加できません" });
        }
        let salesLead: CallforceImportResult | null = null;
        try {
          const lead = await getLead(body.id);
          if (!lead) throw new Error("反響リードが見つかりません");
          const contactNote = await getContactNote(lead.phoneNumber);
          salesLead = await createLeadFromCallforce(lead, contactNote);
        } catch (e) {
          console.error("[leads] アポ獲得管理への追加に失敗:", e);
          return NextResponse.json({
            ok: true,
            salesLeadError: `アポ獲得管理への追加に失敗しました: ${(e as Error).message}`,
          });
        }
        return NextResponse.json({ ok: true, salesLead });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[leads] 更新に失敗:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
