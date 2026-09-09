"use client";

// 反響リード。
//
// ダッシュボードと一覧をタブで切り替える。
// 開いた直後はダッシュボードを出す。まず全体の状況を見て、
// 手を動かすときに一覧へ移る、という順番が自然なため。
//
// データは Callforce 側の Supabase にあり、ここでは複製しない。
// 複製すると「どちらが正か」が曖昧になり、LINE通知の対応済み判定とズレる。

import React, { useCallback, useEffect, useState } from "react";
import { phoneKey, type Lead, type LeadStatus } from "@/lib/callforce";
import { Dashboard } from "./Dashboard";
import { LeadList } from "./LeadList";

const TABS = ["ダッシュボード", "反響リスト"] as const;
type Tab = (typeof TABS)[number];

export default function LeadsPage() {
  const [tab, setTab] = useState<Tab>("ダッシュボード");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [responders, setResponders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** アポ獲得管理に追加できたときの案内。数秒で消す */
  const [notice, setNotice] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/leads");
      // JSON 以外が返ることがある。ブラウザに古い画面が残っていて
      // 移動前のURLを叩くと404のHTMLが返り、そのまま JSON.parse すると
      // 「Unexpected token '<'」という原因の分からない文言になる。
      const text = await res.text();
      let json: { leads?: Lead[]; responders?: string[]; error?: string };
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(
          res.status === 404
            ? "画面が古くなっています。ページを再読み込みしてください（⌘+Shift+R）"
            : `サーバーから予期しない応答が返りました (${res.status})`
        );
      }
      if (!res.ok) throw new Error(json?.error ?? `取得に失敗しました (${res.status})`);
      setLeads(json.leads ?? []);
      setResponders(json.responders ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // 20秒ごとに取り直す。5分以内に架電するのが目標なので、
    // 1分待たせると持ち時間の2割を気づくまでに使ってしまう。
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [load]);

  /** 画面上だけ先に変えて、裏で保存する。待たされる感じをなくす */
  const patch = useCallback(
    async (
      id: string,
      patchBody: {
        status?: LeadStatus;
        assignedTo?: string;
        nextActionAt?: string | null;
        acquisitionChannel?: string | null;
      }
    ) => {
      const before = leads;
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patchBody } : l)));
      setSavingId(id);
      try {
        const res = await fetch("/api/leads", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...patchBody }),
        });
        const j = (await res.json().catch(() => null)) as {
          error?: string;
          salesLead?: { id: number; created: boolean };
          salesLeadError?: string;
        } | null;
        if (!res.ok) {
          // 「アポ獲得には流入経路が必要」など、理由が返るものはそのまま出す
          throw new Error(j?.error ?? "保存に失敗しました");
        }
        // アポ獲得にしたときは、アポ獲得管理にリードが作られる。
        // 作られたのか・既にあったのか・失敗したのかを、その場で分かるようにする
        if (j?.salesLeadError) {
          setError(j.salesLeadError);
        } else if (j?.salesLead) {
          setError(null);
          setNotice(
            j.salesLead.created
              ? `アポ獲得管理にリードを追加しました（案件ID ${j.salesLead.id}）`
              : `アポ獲得管理には登録済みです（案件ID ${j.salesLead.id}）`
          );
        }
      } catch (e) {
        setLeads(before); // 戻す。保存できていないのに変わって見えるのが一番困る
        setError((e as Error).message);
      } finally {
        setSavingId(null);
      }
    },
    [leads]
  );

  /**
   * 電話番号に紐づくメモを保存する。
   * 同じ番号の行はすべて同じメモなので、画面上でもまとめて書き換える。
   */
  const saveNote = useCallback(async (phoneNumber: string, note: string) => {
    const key = phoneKey(phoneNumber);
    const before = leads;
    setLeads((prev) =>
      prev.map((l) => (phoneKey(l.phoneNumber) === key ? { ...l, contactNote: note || null } : l))
    );
    try {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, note }),
      });
      if (!res.ok) throw new Error("メモの保存に失敗しました");
    } catch (e) {
      setLeads(before);
      setError((e as Error).message);
    }
  }, [leads]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 8_000);
    return () => clearTimeout(t);
  }, [notice]);

  const 未対応 = leads.filter((l) => l.status === "未対応").length;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">反響リード</h1>
          <p className="mt-1 text-sm text-neutral-500">
            デモ通話・広告フォームから入ったリード。5分以内の折り返しが目標です。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-400">20秒ごとに自動更新</span>
          <button
            onClick={() => void load()}
            className="rounded-2xl border border-neutral-200 bg-white/90 px-4 py-2 text-sm font-medium shadow-sm transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/80 dark:hover:bg-neutral-800"
          >
            最新にする
          </button>
        </div>
      </header>

      <nav className="flex gap-1 self-start rounded-2xl border border-neutral-200 bg-white/90 p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/80">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
              tab === t
                ? "bg-[#9e8d70] text-white shadow-sm"
                : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            }`}
          >
            {t}
            {/* 未対応が残っているうちは、リストを開かなくても件数が見えるようにする */}
            {t === "反響リスト" && 未対応 > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                  tab === t ? "bg-white/25 text-white" : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                }`}
              >
                {未対応}
              </span>
            )}
          </button>
        ))}
      </nav>

      {error && (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <span>✓ {notice}</span>
          <a href="/appointments" className="font-medium underline underline-offset-2">
            アポ獲得管理を開く
          </a>
        </p>
      )}

      {tab === "ダッシュボード" ? (
        <Dashboard leads={leads} />
      ) : (
        <LeadList
          leads={leads}
          responders={responders}
          loading={loading}
          savingId={savingId}
          onPatch={(id, p) => void patch(id, p)}
          onSaveNote={saveNote}
        />
      )}
    </div>
  );
}
