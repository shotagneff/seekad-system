"use client";

// アプローチリスト（→ /approach）。
//
// 業界 → 都道府県 → 会社一覧 の入口。ここでは業界だけを並べる。
// 先に業界で絞るのは、営業は「今日は不動産に電話する」と決めてから動くため。

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { PAGE_MAIN, PAGE_INNER, PANEL, PageHeader } from "@/components/panel";
import type { Industry } from "@/lib/approach-types";
import { Notice, SubNav, readJson } from "./ui";

export default function ApproachPage() {
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const json = await readJson<{ industries: Industry[] }>(await fetch("/api/approach", { cache: "no-store" }));
        setIndustries(json.industries ?? []);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const totals = industries.reduce(
    (acc, i) => ({ companies: acc.companies + i.companyCount, untouched: acc.untouched + i.untouchedCount }),
    { companies: 0, untouched: 0 },
  );

  return (
    <main className={PAGE_MAIN}>
      <div className={PAGE_INNER}>
        <PageHeader
          eyebrow="Approach List"
          title="アプローチリスト"
          description="業界と都道府県で分かれた営業先リスト。担当・手段・状況をその場で記録し、営業別の件数と反応率を集計します。"
        />
        <SubNav />

        {loading && <Notice>読み込み中…</Notice>}
        {error && <Notice tone="error">{error}</Notice>}

        {!loading && !error && industries.length === 0 && (
          <Notice>
            業界がまだ登録されていません。管理者が「リストを登録・編集（管理）」から業界とスプレッドシートを登録すると、ここに並びます。
          </Notice>
        )}

        {industries.length > 0 && (
          <>
            <p className="text-xs text-neutral-500">
              全体 {totals.companies.toLocaleString()} 社 / 未対応 {totals.untouched.toLocaleString()} 社
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {industries.map((ind) => (
                <Link
                  key={ind.id}
                  href={`/approach/${ind.id}`}
                  className={`${PANEL} group flex flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:border-[#9e8d70] hover:shadow-md`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                      {ind.name}
                    </h2>
                    <span className="rounded-full bg-[#f2e7d3] px-2.5 py-1 text-[11px] font-semibold text-[#7d6b4a]">
                      {ind.listCount} リスト
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-[11px] uppercase tracking-[0.12em] text-neutral-400">会社数</dt>
                      <dd className="mt-0.5 text-xl font-semibold tabular-nums">{ind.companyCount.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-[0.12em] text-neutral-400">未対応</dt>
                      <dd
                        className={`mt-0.5 text-xl font-semibold tabular-nums ${
                          ind.untouchedCount > 0 ? "text-red-600 dark:text-red-400" : ""
                        }`}
                      >
                        {ind.untouchedCount.toLocaleString()}
                      </dd>
                    </div>
                  </dl>
                  <span className="mt-auto text-xs text-neutral-400 group-hover:text-[#9e8d70]">都道府県を選ぶ →</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
