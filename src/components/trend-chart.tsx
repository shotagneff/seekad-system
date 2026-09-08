"use client";

// 件数の推移グラフ（汎用）。
//
// 反響リードとアポ獲得管理の両方で同じ見た目を使うため、系列(series)を外から渡す。
//   mode="stack" … 積み上げ棒（種別のように排他な内訳。＋対応済みの折れ線）
//   mode="group" … 日ごとに横並び棒（アポ→案件化→成約のように包含関係で積み上げられないもの）
//   mode="line"  … 系列ごとの折れ線。値が null の点は打たず線を途切れさせる（率の分母 0 など）
//   valueFormat="percent" … 軸と吹き出しを % で出す（率の推移）
//   showValues … line モードで各点の横に値を書く（「3件」「20%」が読み取れるように）
//
// グラフのライブラリは足していない。この1枚のために依存を増やすとバンドルが重くなる。SVG で足りる。

import React, { useId, useState } from "react";

export type TrendSeries = { key: string; color: string };
export type TrendDatum = {
  key: string;
  label: string;
  weekend: boolean;
  /** stack モードの合計（軸の目盛り決めと「計」表示に使う） */
  total: number;
  /** null は「値が出せない」（率の分母が 0 など）。line モードでは点を打たない */
  byKind: Record<string, number | null>;
  /** 折れ線（対応済みなど）。showLine のときだけ描く */
  responded: number;
};

const SEG_GAP = 2;
const LINE_CLASS = "text-neutral-800 dark:text-neutral-100";

/** 上端だけ角を丸めた棒。下端は軸に接するので角のまま */
function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  if (rr === 0) return `M${x},${y}h${w}v${h}h${-w}Z`;
  return (
    `M${x},${y + h}L${x},${y + rr}Q${x},${y} ${x + rr},${y}` +
    `L${x + w - rr},${y}Q${x + w},${y} ${x + w},${y + rr}L${x + w},${y + h}Z`
  );
}

/**
 * 1つの x 位置に並ぶ複数系列の値ラベルの y を決める。
 * 基本は点の上。上の点のラベルと重なるときだけ点の下に逃がす。
 * 同じ日にアポ獲得と案件化が同じ件数だと点が重なるので、その対策。
 */
function placeValueLabels(items: { py: number }[]): number[] {
  const order = items.map((it, i) => ({ i, py: it.py })).sort((a, b) => a.py - b.py);
  const out = new Array<number>(items.length);
  let prev = -Infinity;
  for (const { i, py } of order) {
    let ly = py - 6;
    if (ly < prev + 9) ly = py + 12;
    if (ly < prev + 9) ly = prev + 9;
    out[i] = ly;
    prev = ly;
  }
  return out;
}

export function TrendChart({
  points,
  series,
  mode = "stack",
  showLine = true,
  lineLabel = "対応済み",
  valueFormat = "count",
  showValues = false,
}: {
  points: TrendDatum[];
  series: TrendSeries[];
  mode?: "stack" | "group" | "line";
  showLine?: boolean;
  lineLabel?: string;
  valueFormat?: "count" | "percent";
  showValues?: boolean;
}) {
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return <p className="py-10 text-center text-sm text-neutral-400">まだデータがありません</p>;
  }

  const isPercent = valueFormat === "percent";
  const fmt = (v: number) => (isPercent ? `${Number.isInteger(v) ? v : v.toFixed(1)}%` : String(v));

  // 軸の最大は実データから。stack は合計、group/line は系列の最大値で決める。
  // % は 100 を超えないので、目盛りの刻みも % 向けにする。
  const pointMax = (p: TrendDatum) =>
    mode === "stack" ? p.total : Math.max(0, ...series.map((s) => p.byKind[s.key] ?? 0));
  const rawMax = Math.max(isPercent ? 10 : 1, ...points.map(pointMax));
  const step = isPercent
    ? ([5, 10, 20, 25, 50].find((s) => rawMax / s <= 5) ?? 50)
    : ([1, 2, 5, 10, 20, 50, 100].find((s) => rawMax / s <= 5) ?? 200);
  const max = Math.ceil(rawMax / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);

  const W = 640;
  const H = 220;
  const padL = isPercent ? 34 : 28;
  const padR = 8;
  // 値を書くときは一番上の点の上にも文字が乗るので、上を空けておく
  const padT = showValues && mode === "line" ? 18 : 10;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const slot = plotW / points.length;
  const barW = Math.min(28, slot * 0.55);
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const cx = (i: number) => padL + slot * i + slot / 2;

  // group モードの1本幅
  const n = series.length;
  const groupW = Math.min(30, slot * 0.72);
  const gGap = n > 1 ? 2 : 0;
  const gBarW = Math.max(3, (groupW - gGap * (n - 1)) / n);

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${y(p.responded).toFixed(1)}`)
    .join(" ");

  return (
    <div className="flex flex-col gap-3">
      {/* 凡例 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.key}
          </span>
        ))}
        {showLine && (
          <span className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
            <span className="h-0.5 w-4 rounded-full bg-neutral-800 dark:bg-neutral-100" />
            {lineLabel}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[220px] w-full min-w-[36rem]" role="img" aria-label="件数の推移">
          <defs>
            <clipPath id={clipId}>
              <rect x={padL} y={padT} width={plotW} height={plotH} />
            </clipPath>
          </defs>

          {/* 目盛り線 */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y(t)}
                y2={y(t)}
                stroke="currentColor"
                strokeWidth={0.5}
                className="text-neutral-200 dark:text-neutral-700"
              />
              <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill="currentColor" className="tabular-nums text-neutral-400">
                {fmt(t)}
              </text>
            </g>
          ))}

          {/* 土日の薄い背景 */}
          {points.map((p, i) =>
            p.weekend ? (
              <rect
                key={`we-${p.key}`}
                x={padL + slot * i}
                y={padT}
                width={slot}
                height={plotH}
                fill="currentColor"
                className="text-neutral-400/10"
              />
            ) : null
          )}

          {/* 折れ線（line）または 棒（stack/group） */}
          {mode === "line" ? (
            <g>
              {series.map((s) => {
                // null の点は飛ばし、前の点が null なら線を繋がない（M で書き直す）
                let prevMissing = true;
                const d = points
                  .map((p, i) => {
                    const v = p.byKind[s.key];
                    if (v === null || v === undefined) {
                      prevMissing = true;
                      return "";
                    }
                    const cmd = prevMissing ? "M" : "L";
                    prevMissing = false;
                    return `${cmd}${cx(i).toFixed(1)},${y(v).toFixed(1)}`;
                  })
                  .filter(Boolean)
                  .join(" ");
                return (
                  <g key={s.key}>
                    <path d={d} fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
                    {points.map((p, i) => {
                      const v = p.byKind[s.key];
                      if (v === null || v === undefined) return null;
                      // 件数は 0 の点を打たない（0 の日が多く煩くなる）。% は 0% も意味があるので打つ
                      if (!isPercent && v <= 0) return null;
                      return (
                        <circle
                          key={p.key}
                          cx={cx(i)}
                          cy={y(v)}
                          r={3.2}
                          fill={s.color}
                          stroke="var(--background)"
                          strokeWidth={1.5}
                        />
                      );
                    })}
                  </g>
                );
              })}
              {/* 各点の値。線の上に乗るので最後に描く。文字の縁取りで線と重なっても読める */}
              {showValues &&
                points.map((p, i) => {
                  const items = series
                    .map((s) => ({ s, v: p.byKind[s.key] }))
                    .filter((it): it is { s: TrendSeries; v: number } => {
                      if (it.v === null || it.v === undefined) return false;
                      return isPercent || it.v > 0;
                    })
                    .map((it) => ({ ...it, py: y(it.v) }));
                  if (items.length === 0) return null;
                  const ys = placeValueLabels(items);
                  return (
                    <g key={`v-${p.key}`}>
                      {items.map((it, j) => (
                        <text
                          key={it.s.key}
                          x={cx(i)}
                          y={ys[j]}
                          textAnchor="middle"
                          fontSize={8.5}
                          fontWeight={600}
                          fill={it.s.color}
                          stroke="var(--background)"
                          strokeWidth={2.5}
                          paintOrder="stroke"
                          className="tabular-nums"
                        >
                          {fmt(it.v)}
                        </text>
                      ))}
                    </g>
                  );
                })}
            </g>
          ) : (
          <g clipPath={`url(#${clipId})`}>
            {points.map((p, i) => {
              const dim = hover === null || hover === i ? 1 : 0.35;
              if (mode === "group") {
                return (
                  <g key={p.key} opacity={dim}>
                    {series.map((s, j) => {
                      const v = p.byKind[s.key] ?? 0;
                      if (v <= 0) return null;
                      const h = Math.max(1.5, (v / max) * plotH);
                      const x = cx(i) - groupW / 2 + j * (gBarW + gGap);
                      return <path key={s.key} d={barPath(x, y(v), gBarW, h, 3)} fill={s.color} />;
                    })}
                  </g>
                );
              }
              // stack
              const segs: { key: string; color: string; from: number; to: number }[] = [];
              let acc = 0;
              for (const s of series) {
                const v = p.byKind[s.key] ?? 0;
                if (v > 0) segs.push({ key: s.key, color: s.color, from: acc, to: acc + v });
                acc += v;
              }
              return (
                <g key={p.key} opacity={dim}>
                  {segs.map((s, si) => {
                    const bottom = y(s.from);
                    const isTop = si === segs.length - 1;
                    const drawTop = y(s.to) + (isTop ? 0 : SEG_GAP);
                    const h = Math.max(1.5, bottom - drawTop);
                    return <path key={s.key} d={barPath(cx(i) - barW / 2, bottom - h, barW, h, isTop ? 3 : 0)} fill={s.color} />;
                  })}
                </g>
              );
            })}
          </g>
          )}

          {/* 折れ線 */}
          {showLine && (
            <g className={LINE_CLASS}>
              <path d={linePath} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
              {points.map((p, i) =>
                p.responded > 0 ? (
                  <circle key={`d-${p.key}`} cx={cx(i)} cy={y(p.responded)} r={3} fill="currentColor" stroke="var(--background)" strokeWidth={1.5} />
                ) : null
              )}
            </g>
          )}

          {/* X軸ラベル（多いときは右端から1つおき。月次の12点は全部出す） */}
          {points.map((p, i) => {
            const thin = points.length > 12 && (points.length - 1 - i) % 2 === 1;
            if (thin) return null;
            return (
              <text
                key={`x-${p.key}`}
                x={cx(i)}
                y={H - 12}
                textAnchor="middle"
                fontSize={8.5}
                fill="currentColor"
                className={p.weekend ? "text-neutral-300" : "text-neutral-500"}
              >
                {p.label}
              </text>
            );
          })}

          {/* hover 当たり判定 */}
          {points.map((p, i) => (
            <rect
              key={`h-${p.key}`}
              x={padL + slot * i}
              y={padT}
              width={slot}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <title>
                {mode === "stack" ? `${p.label}　計${p.total}件` : p.label}
                {series
                  .filter((s) => {
                    const v = p.byKind[s.key];
                    if (v === null || v === undefined) return false;
                    return isPercent || v > 0;
                  })
                  .map((s) => `\n${s.key} ${fmt(p.byKind[s.key] as number)}`)
                  .join("")}
                {showLine ? `\n${lineLabel} ${p.responded}` : ""}
              </title>
            </rect>
          ))}
        </svg>
      </div>
    </div>
  );
}
