"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";
import { canViewRestricted } from "@/lib/roles";

const MAIN_COLOR = "#9e8d70";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // 権限が確認できるまでは開ける前提で描く（サイドバーと同じ理由）
  const [canSeeRestricted, setCanSeeRestricted] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) {
          setCanSeeRestricted(false);
          return;
        }
        const data = (await res.json()) as { role?: string };
        setCanSeeRestricted(canViewRestricted(data?.role));
      } catch {
        setCanSeeRestricted(false);
      }
    };

    void load();
  }, []);

  const toggle = () => setOpen((prev) => !prev);
  const close = () => setOpen(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return href !== "#" && pathname.startsWith(href);
  };

  return (
    <div className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 px-4 py-3 text-sm shadow-sm dark:border-neutral-800 dark:bg-neutral-950/95">
      <div className="flex items-center justify-between">
        <Link href="/" onClick={close}>
          <div className="flex flex-col">
            <span
              className="block text-xs font-semibold uppercase tracking-wide"
              style={{ color: MAIN_COLOR }}
            >
              シークアドシステム
            </span>
            <span className="text-sm font-bold text-neutral-900 dark:text-neutral-50">
              SEEKAD 社内統合管理
            </span>
          </div>
        </Link>
        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-700 shadow-sm hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          aria-label="メニューを開く"
        >
          <div className="space-y-[3px]">
            <span className="block h-[2px] w-4 rounded bg-neutral-800 dark:bg-neutral-100" />
            <span className="block h-[2px] w-4 rounded bg-neutral-800 dark:bg-neutral-100" />
            <span className="block h-[2px] w-4 rounded bg-neutral-800 dark:bg-neutral-100" />
          </div>
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-1 rounded-2xl border border-neutral-200 bg-white p-2 text-sm shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
          <MobileLink href="/" label="ホーム" active={isActive("/")} onClick={close} />
          <MobileLink
            href="/daily-reports"
            label="日報・ホウレンソウ"
            active={isActive("/daily-reports")}
            onClick={close}
          />
          <MobileLink
            href="/approach"
            label="アプローチリスト"
            active={isActive("/approach")}
            onClick={close}
          />
          <MobileLink
            href="/leads"
            label="反響リード"
            active={isActive("/leads")}
            onClick={close}
            locked={!canSeeRestricted}
          />
          <MobileLink
            href="/appointments"
            label="アポ獲得管理"
            active={isActive("/appointments")}
            onClick={close}
          />
          <MobileLink
            href="/nurturing"
            label="ナーチャリング"
            active={isActive("/nurturing")}
            onClick={close}
            locked={!canSeeRestricted}
          />
          <MobileLink
            href="/attendance"
            label="出勤スケジュール"
            active={isActive("/attendance")}
            onClick={close}
          />
          <MobileLink
            href="/performance"
            label="成績"
            active={isActive("/performance")}
            onClick={close}
            locked={!canSeeRestricted}
          />
          <MobileLink
            href="/dashboard"
            label="売上・KPIダッシュボード"
            active={isActive("/dashboard")}
            onClick={close}
            locked={!canSeeRestricted}
          />
          <MobileLink
            href="/e-learning"
            label="動画研修ラーニング"
            active={isActive("/e-learning")}
            onClick={close}
          />
          <MobileLink
            href="/partners/mindmap"
            label="パートナー紹介マインドマップ"
            active={isActive("/partners/mindmap")}
            onClick={close}
          />
          <MobileLink
            href="/documents"
            label="ドキュメント"
            active={isActive("/documents")}
            onClick={close}
          />
        </div>
      )}
    </div>
  );
}

type MobileLinkProps = {
  href: string;
  label: string;
  disabled?: boolean;
  /** 権限が足りず開けない項目。薄く表示して押せなくする */
  locked?: boolean;
  active?: boolean;
  onClick: () => void;
};

function MobileLink({ href, label, disabled, locked, active, onClick }: MobileLinkProps) {
  const base =
    "flex items-center rounded-xl px-3 py-2 text-sm font-medium";

  if (disabled) {
    return (
      <div className={`${base} cursor-not-allowed text-neutral-400 dark:text-neutral-600`}>
        <span>{label}</span>
      </div>
    );
  }

  if (locked) {
    return (
      <div
        className={`${base} cursor-not-allowed text-neutral-400 dark:text-neutral-600`}
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

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`${base} ${
        active
          ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50"
          : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
      }`}
    >
      <span>{label}</span>
    </Link>
  );
}
