"use client";

// 一覧表の共通部品。
//
// 反響リードとアポ獲得管理で同じものを使う。
// 片方だけ直して見た目がずれるのを防ぐため、色も幅も余白もここに集める。

import React from "react";

export const ACCENT = "#9e8d70";

/**
 * 色の決まり。どの画面でも同じ意味で使う。
 * 画面ごとに色の意味が変わると、並べて見たときに読み違える。
 *
 *   グレー  まだ動いていない / 終わったもの
 *   水色    着手した
 *   オレンジ 山場
 *   黄      成果
 *   シアン  受注（成果の先。水色より濃く、初回面談・提案と見分ける）
 *   紫      本筋から外れた形（協業・留守番電話）
 *   赤      手が止まっている
 *
 * 緑は使わない。「アポ獲得は緑ではなく黄」と決めたため。
 */
export const TONE = {
  gray: "bg-neutral-200 text-neutral-700 ring-neutral-300 dark:bg-neutral-500/25 dark:text-neutral-200 dark:ring-neutral-400/40",
  sky: "bg-sky-200 text-sky-900 ring-sky-300 dark:bg-sky-500/25 dark:text-sky-100 dark:ring-sky-400/40",
  orange:
    "bg-orange-200 text-orange-900 ring-orange-300 dark:bg-orange-500/25 dark:text-orange-100 dark:ring-orange-400/40",
  yellow:
    "bg-yellow-300 text-yellow-900 ring-yellow-400 dark:bg-yellow-400/25 dark:text-yellow-100 dark:ring-yellow-400/40",
  violet:
    "bg-violet-200 text-violet-900 ring-violet-300 dark:bg-violet-500/25 dark:text-violet-100 dark:ring-violet-400/40",
  red: "bg-red-200 text-red-900 ring-red-300 dark:bg-red-500/25 dark:text-red-100 dark:ring-red-400/40",
  cyan: "bg-cyan-300 text-cyan-900 ring-cyan-400 dark:bg-cyan-400/25 dark:text-cyan-100 dark:ring-cyan-400/40",
} as const;

/**
 * 行の塗りつぶし。
 *
 * 5〜10%では白地でほとんど見えなかったので 40% まで上げた。
 * 300番台を40%で敷くぶんには、上に載る黒文字のコントラストは落ちない。
 * 暗い画面は地が黒く同じ数字だと沈むため、別の値を当てる。
 */
export const FILL = {
  yellow: "bg-yellow-300/40 dark:bg-yellow-400/15",
  orange: "bg-orange-300/40 dark:bg-orange-500/15",
  violet: "bg-violet-300/40 dark:bg-violet-500/15",
  gray: "bg-neutral-300/40 dark:bg-neutral-500/15",
  red: "bg-red-300/40 dark:bg-red-500/15",
  cyan: "bg-cyan-300/40 dark:bg-cyan-400/15",
  none: "",
} as const;

/**
 * 列ごとの最低幅。
 * 既定のままだと中身の文字数で幅が決まり、
 * 選択欄（担当者・状況）や短い値（役職・電話番号）が潰れる。
 */
export const W = {
  owner: "min-w-[7.5rem]",
  phase: "min-w-[9.5rem]", // 色付きの選択欄1つぶん
  grade: "min-w-[8rem]",
  person: "min-w-[9.5rem]",
  title: "min-w-[9rem]",
  phone: "min-w-[10.5rem]",
  channel: "min-w-[10rem]",
  date: "min-w-[9rem]",
} as const;

export const TH =
  "whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-400";
export const TD = "whitespace-nowrap px-3 py-2 text-sm";

/** 表の中で使う入力欄。枠を出さず、触れるところだけ分かるようにする */
export const CELL_INPUT =
  "w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none hover:border-neutral-200 focus:border-neutral-300 focus:bg-white dark:hover:border-neutral-700 dark:focus:border-neutral-600 dark:focus:bg-neutral-900";

/** 行に色を敷いたとき、ホバーの背景色で塗りを消さないようにする */
export const ROW_HOVER = "transition hover:brightness-[0.97] dark:hover:brightness-125";

export function TableFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white/90 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/80">
      {children}
    </div>
  );
}

export function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white/90 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/80">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  // 桁数の多い金額でもカード幅に収まるよう、文字数に応じて数字のサイズを落とす
  const size =
    value.length >= 11 ? "text-lg" : value.length >= 9 ? "text-xl" : value.length >= 7 ? "text-2xl" : "text-3xl";
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white/90 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/80">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-400">{label}</p>
      <p className={`mt-2 ${size} font-semibold tabular-nums tracking-tight`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}

/**
 * 色の付いた選択欄。
 *
 * バッジと選択欄を横に並べると、同じことを2回見せることになり幅も食う。
 * 選択欄そのものに色を敷いて1つにまとめる。
 * 確度や担当と同じく「押せば変わる」1個の部品として扱える。
 */
export function ToneSelect({
  value,
  options,
  tone,
  onChange,
}: {
  value: string;
  options: readonly string[];
  tone: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full cursor-pointer rounded-full py-1.5 pl-3 pr-2 text-xs font-semibold ring-1 ring-inset outline-none ${tone}`}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function Pill({ text, tone }: { text: string; tone: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}>
      {text}
    </span>
  );
}

/** 絞り込みの丸ボタン */
export function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
      }`}
    >
      {label}
    </button>
  );
}

export function yen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}
