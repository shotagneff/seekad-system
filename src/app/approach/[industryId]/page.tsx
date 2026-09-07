"use client";

// 業界の中の都道府県一覧（→ /approach/[industryId]）。
// 1つの都道府県 = 1つのスプレッドシート = 1つのリスト。
//
// 都道府県は日本地図（タイル型）から選ぶ。46県がカードで並ぶと目で探すのが大変なため。
// 登録済みの県だけ色が付き、押すとそのリストへ移動する。
// 地図の右に、選んだ県の中身と、登録済みの県の一覧（北→南）を出す。

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PAGE_MAIN, PAGE_INNER, PANEL, PageHeader } from "@/components/panel";
import { JapanTileMap, REGIONS, hasTile, prefectureOrder, type MapTile } from "@/components/japan-map";
import { Kpi } from "@/components/table-ui";
import type { ApproachList, Industry } from "@/lib/approach-types";
import { Breadcrumb, Notice, SubNav, readJson, shortDateTime } from "../ui";

export default function IndustryPage() {
  const params = useParams<{ industryId: string }>();
  const router = useRouter();
  const industryId = params?.industryId ?? "";

  const [industry, setIndustry] = useState<Industry | null>(null);
  const [lists, setLists] = useState<ApproachList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!industryId) return;
    const load = async () => {
      try {
        const json = await readJson<{ industries: Industry[]; lists: ApproachList[] }>(
          await fetch("/api/approach", { cache: "no-store" }),
        );
        const ind = (json.industries ?? []).find((i) => i.id === industryId) ?? null;
        setIndustry(ind);
        setLists(
          (json.lists ?? [])
            .filter((l) => l.industryId === industryId)
            .sort((a, b) => prefectureOrder(a.prefecture) - prefectureOrder(b.prefecture)),
        );
        if (!ind) setError("業界が見つかりません");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [industryId]);

  /** 都道府県 → その県のリスト（複数登録も許しているので配列） */
  const byPrefecture = useMemo(() => {
    const map = new Map<string, ApproachList[]>();
    for (const l of lists) {
      const arr = map.get(l.prefecture) ?? [];
      arr.push(l);
      map.set(l.prefecture, arr);
    }
    return map;
  }, [lists]);

  const tiles = useMemo(() => {
    const t: Record<string, MapTile> = {};
    for (const [pref, arr] of byPrefecture) {
      if (!hasTile(pref)) continue;
      const companies = arr.reduce((n, l) => n + l.companyCount, 0);
      const untouched = arr.reduce((n, l) => n + l.untouchedCount, 0);
      const appointments = arr.reduce((n, l) => n + l.appointmentCount, 0);
      t[pref] = {
        badge: untouched,
        sub: `${companies}社`,
        title: `${pref}: ${companies}社 / 未対応 ${untouched}${appointments ? ` / アポ ${appointments}` : ""}`,
      };
    }
    return t;
  }, [byPrefecture]);

  /** 地図で押したとき。リストが1つならそのまま移動、複数なら右側で選ばせる */
  const handleSelect = (pref: string) => {
    const arr = byPrefecture.get(pref) ?? [];
    setSelected(pref);
    if (arr.length === 1) router.push(`/approach/list/${arr[0].id}`);
  };

  const others = lists.filter((l) => !hasTile(l.prefecture));
  const totals = lists.reduce(
    (acc, l) => ({
      companies: acc.companies + l.companyCount,
      untouched: acc.untouched + l.untouchedCount,
      appointments: acc.appointments + l.appointmentCount,
    }),
    { companies: 0, untouched: 0, appointments: 0 },
  );
  const selectedLists = selected ? (byPrefecture.get(selected) ?? []) : [];

  return (
    <main className={PAGE_MAIN}>
      <div className={PAGE_INNER}>
        <PageHeader
          eyebrow="Approach List"
          title={industry ? industry.name : "アプローチリスト"}
          description="地図の色付きの県を押すと、その県の会社一覧が開きます。赤い数字は未対応の会社数です。"
        />
        <SubNav />
        <Breadcrumb items={[{ href: "/approach", label: "業界" }, { label: industry?.name ?? "…" }]} />

        {loading && <Notice>読み込み中…</Notice>}
        {error && <Notice tone="error">{error}</Notice>}

        {!loading && !error && lists.length === 0 && (
          <Notice>この業界にはまだリストがありません。管理画面から都道府県とスプレッドシートを登録してください。</Notice>
        )}

        {lists.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="登録済みの県" value={String(byPrefecture.size)} hint="地図の色付きタイル" />
            <Kpi label="会社数" value={totals.companies.toLocaleString()} hint="この業界の合計" />
            <Kpi label="未対応" value={totals.untouched.toLocaleString()} hint="どの手段もまだ" />
            <Kpi label="アポ獲得" value={totals.appointments.toLocaleString()} hint={totals.companies ? `${Math.round((totals.appointments / totals.companies) * 1000) / 10}%` : "–"} />
          </div>
        )}

        {lists.length > 0 && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
            <div className={`${PANEL} p-4 sm:p-6`}>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">都道府県を選ぶ</h2>
                <span className="text-[11px] text-neutral-400">県を押すと会社一覧へ</span>
              </div>
              <JapanTileMap tiles={tiles} selected={selected} onSelect={handleSelect} />
              <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-neutral-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm border border-[#d9c9a6] bg-gradient-to-br from-[#fbf3e3] to-[#ecdcbd]" />
                  リストあり
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm border border-neutral-200 bg-neutral-100" />
                  未登録
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-600 text-[8px] font-bold text-white">
                    3
                  </span>
                  未対応の会社数
                </span>
                {others.length > 0 && (
                  <span className="ml-auto">
                    地図外:{" "}
                    {others.map((l) => (
                      <Link key={l.id} href={`/approach/list/${l.id}`} className="ml-1 underline hover:text-[#9e8d70]">
                        {l.prefecture}
                        {l.name ? `（${l.name}）` : ""}
                      </Link>
                    ))}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {selected && selectedLists.length > 1 && (
                <div className={`${PANEL} p-4`}>
                  <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                    {selected} にはリストが {selectedLists.length} 件あります
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {selectedLists.map((l) => (
                      <li key={l.id}>
                        <Link
                          href={`/approach/list/${l.id}`}
                          className="flex items-center justify-between rounded-xl border border-neutral-200 px-3 py-2 text-sm hover:border-[#9e8d70] dark:border-neutral-800"
                        >
                          <span className="truncate">{l.name ?? "（名前なし）"}</span>
                          <span className="ml-3 shrink-0 text-xs text-neutral-500">
                            {l.companyCount}社 / 未対応 {l.untouchedCount}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={`${PANEL} overflow-hidden`}>
                <div className="border-b border-neutral-100 px-4 py-3 text-xs font-semibold text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">
                  登録済みの都道府県（{lists.length} 件・北から順）
                </div>
                <ul className="max-h-[560px] divide-y divide-neutral-100 overflow-y-auto dark:divide-neutral-800">
                  {REGIONS.map((region) => {
                    const rows = lists.filter((l) => region.prefectures.includes(l.prefecture));
                    if (rows.length === 0) return null;
                    return (
                      <li key={region.name}>
                        <div className="bg-neutral-50/80 px-4 py-1.5 text-[10px] uppercase tracking-[0.14em] text-neutral-400 dark:bg-neutral-900/60">
                          {region.name}
                        </div>
                        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                          {rows.map((l) => {
                            const done = l.companyCount - l.untouchedCount;
                            const progress = l.companyCount ? Math.round((done / l.companyCount) * 100) : 0;
                            return (
                              <li key={l.id}>
                                <Link
                                  href={`/approach/list/${l.id}`}
                                  onMouseEnter={() => setSelected(l.prefecture)}
                                  className="flex items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-[#fdf7e7]/70 dark:hover:bg-neutral-800/60"
                                >
                                  <span className="w-16 shrink-0 font-medium">{l.prefecture}</span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                                      <span className="block h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: "#9e8d70" }} />
                                    </span>
                                    {l.name && <span className="mt-0.5 block truncate text-[11px] text-neutral-400">{l.name}</span>}
                                  </span>
                                  <span className="shrink-0 text-right text-xs tabular-nums text-neutral-500">
                                    <span className="block">
                                      {l.companyCount}社
                                      {l.untouchedCount > 0 && (
                                        <span className="ml-1 text-red-600 dark:text-red-400">未対応 {l.untouchedCount}</span>
                                      )}
                                    </span>
                                    <span className="block text-[10px] text-neutral-400">
                                      {l.appointmentCount > 0 ? `アポ ${l.appointmentCount} / ` : ""}
                                      {l.lastSyncedAt ? `取込 ${shortDateTime(l.lastSyncedAt)}` : "未取込"}
                                    </span>
                                  </span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    );
                  })}
                  {others.length > 0 && (
                    <li>
                      <div className="bg-neutral-50/80 px-4 py-1.5 text-[10px] uppercase tracking-[0.14em] text-neutral-400 dark:bg-neutral-900/60">
                        全国・その他
                      </div>
                      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                        {others.map((l) => (
                          <li key={l.id}>
                            <Link href={`/approach/list/${l.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[#fdf7e7]/70">
                              <span className="flex-1 truncate">{l.name ?? l.prefecture}</span>
                              <span className="text-xs text-neutral-500">
                                {l.companyCount}社 / 未対応 {l.untouchedCount}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
