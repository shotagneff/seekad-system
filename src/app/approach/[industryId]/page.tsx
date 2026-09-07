"use client";

// 業界の中の都道府県一覧（→ /approach/[industryId]）。
// 1つの都道府県 = 1つのスプレッドシート = 1つのリスト。

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PAGE_MAIN, PAGE_INNER, PANEL, PageHeader } from "@/components/panel";
import type { ApproachList, Industry } from "@/lib/approach-types";
import { Breadcrumb, Notice, SubNav, readJson, shortDateTime } from "../ui";

export default function IndustryPage() {
  const params = useParams<{ industryId: string }>();
  const industryId = params?.industryId ?? "";

  const [industry, setIndustry] = useState<Industry | null>(null);
  const [lists, setLists] = useState<ApproachList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!industryId) return;
    const load = async () => {
      try {
        const json = await readJson<{ industries: Industry[]; lists: ApproachList[] }>(
          await fetch("/api/approach", { cache: "no-store" }),
        );
        const ind = (json.industries ?? []).find((i) => i.id === industryId) ?? null;
        setIndustry(ind);
        setLists((json.lists ?? []).filter((l) => l.industryId === industryId));
        if (!ind) setError("業界が見つかりません");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [industryId]);

  return (
    <main className={PAGE_MAIN}>
      <div className={PAGE_INNER}>
        <PageHeader
          eyebrow="Approach List"
          title={industry ? industry.name : "アプローチリスト"}
          description="都道府県を選ぶと、その地域の会社一覧が開きます。"
        />
        <SubNav />
        <Breadcrumb items={[{ href: "/approach", label: "業界" }, { label: industry?.name ?? "…" }]} />

        {loading && <Notice>読み込み中…</Notice>}
        {error && <Notice tone="error">{error}</Notice>}

        {!loading && !error && lists.length === 0 && (
          <Notice>この業界にはまだリストがありません。管理画面から都道府県とスプレッドシートを登録してください。</Notice>
        )}

        {lists.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lists.map((l) => {
              const done = l.companyCount - l.untouchedCount;
              const progress = l.companyCount ? Math.round((done / l.companyCount) * 100) : 0;
              return (
                <Link
                  key={l.id}
                  href={`/approach/list/${l.id}`}
                  className={`${PANEL} group flex flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:border-[#9e8d70] hover:shadow-md`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                        {l.prefecture}
                      </h2>
                      {l.name && <p className="truncate text-xs text-neutral-500">{l.name}</p>}
                    </div>
                    {l.appointmentCount > 0 && (
                      <span className="shrink-0 rounded-full bg-yellow-200 px-2.5 py-1 text-[11px] font-semibold text-yellow-900">
                        アポ {l.appointmentCount}
                      </span>
                    )}
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-[11px] uppercase tracking-[0.12em] text-neutral-400">会社数</dt>
                      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{l.companyCount}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-[0.12em] text-neutral-400">未対応</dt>
                      <dd
                        className={`mt-0.5 text-lg font-semibold tabular-nums ${
                          l.untouchedCount > 0 ? "text-red-600 dark:text-red-400" : ""
                        }`}
                      >
                        {l.untouchedCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-[0.12em] text-neutral-400">対応済</dt>
                      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{done}</dd>
                    </div>
                  </dl>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: "#9e8d70" }} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-neutral-400">
                    <span>{l.lastSyncedAt ? `取込 ${shortDateTime(l.lastSyncedAt)}` : "未取込"}</span>
                    {l.lastSyncError && <span className="text-red-500">取込エラー</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
