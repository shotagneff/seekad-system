"use client";

// アポ獲得管理。
//
// スプレッドシート「アポイント獲得」の移管先。
// リード → 案件 → 顧客 の順に進み、途中で落ちたものが失注に出る。
// 元シートでは各段階を人が手でコピペしていた。ここでは自動で繋がる。

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { OPEN_DEAL_PHASES, type Customer, type Deal, type Lead } from "@/lib/sales-types";
import { orderedOwners } from "@/lib/sales-performance";
import { CustomerTable, DealTable, LeadTable, LostTable, type Patch } from "./tables";
import { Kpi } from "./ui";
import { AppointmentDashboard } from "./dashboard";

const TABS = ["リード管理", "案件管理", "顧客管理", "失注管理"] as const;
type Tab = (typeof TABS)[number];

type Payload = {
  leads: Lead[];
  deals: Deal[];
  customers: Customer[];
  /** 担当者の候補（登録ユーザー＋データにある担当）。API が並べて返す */
  owners: string[];
};

export default function AppointmentsPage() {
  const [view, setView] = useState<"ダッシュボード" | "アポ獲得リスト">("ダッシュボード");
  const [tab, setTab] = useState<Tab>("リード管理");
  const [data, setData] = useState<Payload>({ leads: [], deals: [], customers: [], owners: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/sales");
      const text = await res.text();
      let json: Payload & { error?: string };
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
      setData({
        leads: json.leads ?? [],
        deals: json.deals ?? [],
        customers: json.customers ?? [],
        owners: json.owners ?? [],
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 画面を先に書き換えて、裏で保存する。
   * フェーズを進めると案件や顧客が増えるので、保存後に読み直す。
   */
  const patch: Patch = useCallback(
    async (kind, id, body) => {
      setData((prev) => ({
        ...prev,
        leads: kind === "lead" ? prev.leads.map((l) => (l.id === id ? { ...l, ...body } : l)) : prev.leads,
        deals: kind === "deal" ? prev.deals.map((d) => (d.id === id ? { ...d, ...body } : d)) : prev.deals,
        customers:
          kind === "customer" ? prev.customers.map((c) => (c.id === id ? { ...c, ...body } : c)) : prev.customers,
      }));
      setSaving(true);
      try {
        const res = await fetch("/api/sales", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, id, patch: body }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error ?? "保存に失敗しました");
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSaving(false);
        await load();
      }
    },
    [load]
  );

  const create = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "lead", patch: {} }),
      });
      if (!res.ok) throw new Error("追加に失敗しました");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
      await load();
    }
  }, [load]);

  // 古い API（owners 無し）でもデータにある担当だけは出す
  const owners = useMemo(() => orderedOwners(data, data.owners), [data]);

  const kpis = useMemo(() => {
    const open = data.deals.filter((d) => OPEN_DEAL_PHASES.includes(d.phase));
    const won = data.deals.filter((d) => d.phase === "受注");
    const active = data.customers.filter((c) => c.status === "稼働");
    return {
      leads: data.leads.filter((l) => l.phase !== "失注").length,
      open: open.length,
      pipeline: open.reduce((s, d) => s + d.annualTotal, 0),
      wonTotal: won.reduce((s, d) => s + d.annualTotal, 0),
      mrr: active.reduce((s, c) => s + c.monthlyFee, 0),
      customers: active.length,
    };
  }, [data]);

  const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

  return (
    <div className="mx-auto w-full max-w-[110rem] space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">アポ獲得管理</h1>
          <p className="mt-1 text-sm text-neutral-500">
            リード → 案件 → 顧客。フェーズを進めると次の段階が自動で作られます
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-neutral-400">
          {saving && <span>保存中…</span>}
          <button
            onClick={() => void load()}
            className="rounded-full border border-neutral-200 px-3 py-1.5 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            最新にする
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      <nav className="flex gap-1 self-start rounded-2xl border border-neutral-200 bg-white/90 p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/80">
        {(["ダッシュボード", "アポ獲得リスト"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
              view === v
                ? "bg-[#9e8d70] text-white shadow-sm"
                : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            }`}
          >
            {v}
          </button>
        ))}
      </nav>

      {view === "ダッシュボード" ? (
        <AppointmentDashboard data={data} />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi label="追いかけ中のリード" value={`${kpis.leads}`} hint="失注を除く" />
            <Kpi label="商談中の案件" value={`${kpis.open}`} hint="提案・見積・クロージング" />
            <Kpi label="商談中の想定年間総額" value={yen(kpis.pipeline)} hint="月額×12＋ショット" />
            <Kpi label="受注済みの累計" value={yen(kpis.wonTotal)} hint="受注案件の想定年間総額" />
            <Kpi label="稼働顧客のMRR" value={yen(kpis.mrr)} hint={`${kpis.customers}社`} />
          </section>

          <nav className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                  tab === t
                    ? "text-neutral-900 dark:text-neutral-50"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                }`}
              >
                {t}
                {tab === t && (
                  <span
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                    style={{ backgroundColor: "#9e8d70" }}
                  />
                )}
              </button>
            ))}
          </nav>

          {loading ? (
            <p className="py-16 text-center text-sm text-neutral-400">読み込んでいます…</p>
          ) : (
            <>
              {tab === "リード管理" && (
                <LeadTable leads={data.leads} owners={owners} patch={patch} onCreate={create} />
              )}
              {tab === "案件管理" && <DealTable deals={data.deals} owners={owners} patch={patch} />}
              {tab === "顧客管理" && <CustomerTable customers={data.customers} owners={owners} patch={patch} />}
              {tab === "失注管理" && <LostTable deals={data.deals} patch={patch} />}
            </>
          )}
        </>
      )}
    </div>
  );
}
