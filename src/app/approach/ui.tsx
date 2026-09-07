"use client";

// アプローチリストの画面で共通に使う小さな部品。
//
//   SubNav      「業界から探す / 営業別サマリー」の切り替え（管理者には管理画面への入口も）
//   Breadcrumb  業界 > 都道府県 の現在地
//   Notice      読み込み中・エラー・空のときの一行

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { canManage } from "@/lib/roles";
import { MAIN_COLOR } from "@/components/panel";

export function SubNav() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { role?: string };
        setIsAdmin(canManage(data?.role));
      } catch {
        setIsAdmin(false);
      }
    };
    void load();
  }, []);

  const onSummary = pathname.startsWith("/approach/summary");
  const items = [
    { href: "/approach", label: "業界から探す", active: !onSummary },
    { href: "/approach/summary", label: "営業別サマリー", active: onSummary },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            it.active
              ? "text-white"
              : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
          }`}
          style={it.active ? { backgroundColor: MAIN_COLOR } : undefined}
        >
          {it.label}
        </Link>
      ))}
      {isAdmin && (
        <Link
          href="/admin/approach"
          className="ml-auto rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 hover:border-[#9e8d70] hover:text-[#9e8d70] dark:border-neutral-700 dark:text-neutral-300"
        >
          リストを登録・編集（管理）
        </Link>
      )}
    </div>
  );
}

export function Breadcrumb({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-sm text-neutral-500">
      {items.map((it, i) => (
        <React.Fragment key={`${it.label}-${i}`}>
          {i > 0 && <span className="text-neutral-300">/</span>}
          {it.href ? (
            <Link href={it.href} className="hover:text-[#9e8d70]">
              {it.label}
            </Link>
          ) : (
            <span className="font-medium text-neutral-800 dark:text-neutral-100">{it.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error"; children: React.ReactNode }) {
  const cls =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"
      : "border-neutral-200 bg-white/90 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/80";
  return <div className={`rounded-2xl border px-5 py-4 text-sm ${cls}`}>{children}</div>;
}

/** 「9/7 14:32」のような短い日時 */
export function shortDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 一覧の読み込みで共通の、JSON 以外が返ったときの文言 */
export async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: T & { error?: string };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      res.status === 404
        ? "画面が古くなっています。ページを再読み込みしてください（⌘+Shift+R）"
        : `サーバーから予期しない応答が返りました (${res.status})`,
    );
  }
  if (!res.ok) throw new Error(json?.error ?? `取得に失敗しました (${res.status})`);
  return json;
}
