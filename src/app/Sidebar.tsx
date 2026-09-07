"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { canManage, canViewRestricted } from "@/lib/roles";

const MAIN_COLOR = "#9e8d70";

type SidebarLinkProps = {
  href: string;
  label: string;
  disabled?: boolean;
  /** 権限が足りず開けない項目。薄く表示して押せなくする */
  locked?: boolean;
};

export default function Sidebar() {
  const [showAdmin, setShowAdmin] = useState(false);
  // 権限が確認できるまでは開ける前提で描く。
  // 先に鍵付きで描いてから開くと、読み込みのたびにメニューがちらつく。
  const [canSeeRestricted, setCanSeeRestricted] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) {
          setShowAdmin(false);
          setCanSeeRestricted(false);
          return;
        }
        const data = (await res.json()) as { role?: string };
        setShowAdmin(canManage(data?.role));
        setCanSeeRestricted(canViewRestricted(data?.role));
      } catch {
        setShowAdmin(false);
        setCanSeeRestricted(false);
      }
    };

    void load();
  }, []);

  return (
    <aside
      className="flex w-64 flex-col border-r bg-white px-5 py-6 text-sm shadow-sm dark:bg-neutral-950/90"
      style={{ borderColor: MAIN_COLOR }}
    >
      <div className="mb-5 pb-4 border-b border-neutral-200/70 dark:border-neutral-800/70">
        <Link href="/daily-reports" className="flex items-center gap-3.5">
          <div className="relative h-9 w-9 overflow-hidden rounded-full border border-neutral-200 bg-white shadow-sm dark:border-neutral-700">
            <Image src="/images/logo/logoseekad.png" alt="SEEKAD ロゴ" fill className="object-contain" />
          </div>
          <div>
            <span
              className="block text-sm font-semibold uppercase tracking-wide"
              style={{ color: MAIN_COLOR }}
            >
              シークアドシステム
            </span>
            <span className="text-lg font-bold text-neutral-900 dark:text-neutral-50">
              SEEKAD 社内統合管理
            </span>
          </div>
        </Link>
      </div>

      <nav className="space-y-1">
        <SidebarLink href="/" label="ホーム" />
        <SidebarLink href="/daily-reports" label="日報・ホウレンソウ" />
        <SidebarLink href="/approach" label="アプローチリスト" />
        <SidebarLink href="/leads" label="反響リード" locked={!canSeeRestricted} />
        <SidebarLink href="/appointments" label="アポ獲得管理" />
        <SidebarLink href="/nurturing" label="ナーチャリング" locked={!canSeeRestricted} />
        <SidebarLink href="/attendance" label="出勤スケジュール" />
        <SidebarLink href="/performance" label="成績" locked={!canSeeRestricted} />
        <SidebarLink href="/dashboard" label="売上・KPIダッシュボード" locked={!canSeeRestricted} />
        <SidebarLink href="/e-learning" label="動画研修ラーニング" />
        <SidebarLink href="/partners/mindmap" label="パートナー紹介マインドマップ" />
        <SidebarLink href="/documents" label="ドキュメント" />

        {showAdmin && (
          <>
            <div className="mt-3 border-t border-dashed border-neutral-200 pt-2 text-[10px] uppercase tracking-[0.16em] text-neutral-400 dark:border-neutral-800">
              管理メニュー
            </div>
            <SidebarLink href="/docs" label="ドキュメントゾーン（管理）" />
            <SidebarLink href="/admin/partners-mindmap" label="パートナー紹介マインドマップ（管理）" />
            <SidebarLink href="/admin/approach" label="アプローチリスト（管理）" />
            <SidebarLink href="/admin/e-learning" label="動画研修ラーニング（管理）" />
            <SidebarLink href="/admin/announcements" label="お知らせ管理（管理）" />
            <SidebarLink href="/admin/events" label="イベント管理（管理）" />
            {/* メンバー管理は 2026-09-02 にユーザー管理へ統合（二重管理の解消） */}
            <SidebarLink href="/admin/users" label="ユーザー管理（管理）" />
          </>
        )}
      </nav>

      <div className="mt-auto pt-6 text-[10px] text-neutral-500">
        <p>β版 / デザイン・機能は今後変更される可能性があります。</p>
      </div>
    </aside>
  );
}

function SidebarLink({ href, label, disabled, locked }: SidebarLinkProps) {
  const pathname = usePathname();
  const baseClass =
    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors";

  if (disabled) {
    return (
      <div
        className={`${baseClass} cursor-not-allowed text-neutral-400 dark:text-neutral-600`}
      >
        <span>
          {label}
          <span className="ml-1 text-[10px] align-middle text-neutral-400">
            準備中
          </span>
        </span>
      </div>
    );
  }

  // 権限が足りない項目。管理メニューへは移さず、元の位置に薄く残す。
  // 「そもそも無い」のではなく「自分には開けない」ことが分かる状態にする。
  if (locked) {
    return (
      <div
        className={`${baseClass} cursor-not-allowed text-neutral-400 dark:text-neutral-600`}
        title="権限が異なるため、確認することができません"
      >
        <span className="flex items-center gap-1.5">
          {label}
          <span className="rounded-full border border-neutral-200 px-1.5 py-px text-[10px] leading-none text-neutral-400 dark:border-neutral-700">
            権限
          </span>
        </span>
      </div>
    );
  }

  const isActive =
    href === "/"
      ? pathname === "/"
      : href !== "#" && pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`${baseClass} relative pl-4 ${
        isActive
          ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50"
          : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
      }`}
    >
      {isActive && (
        <span
          className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full"
          style={{ backgroundColor: MAIN_COLOR }}
        />
      )}
      <span>{label}</span>
    </Link>
  );
}
