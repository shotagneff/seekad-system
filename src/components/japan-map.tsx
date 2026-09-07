"use client";

// 日本地図（タイル型）。47都道府県を「だいたいの位置」に四角で並べ、押して選ぶ。
//
// 本物の地形の SVG は形が細かすぎて小さい県が押せず、パスも重い。
// タイル型なら北海道も東京も同じ大きさで押せ、位置関係も分かる。
// アプローチリストの都道府県選択で使う（46県がカードで並ぶと探すのが大変なため）。
//
// SVG の viewBox で描くので、画面幅に合わせて縮む。
// 見た目: 登録済みはゴールドの淡いグラデーション、選択中は濃いゴールド、未登録は薄いグレー。
// タイルの中に県名と社数、右上に未対応の赤い数字。地方名は背景にうっすら置く。

import React, { useId } from "react";

/** 都道府県 → タイルの位置（列, 行）。左上が (0,0) */
const TILE_POS: Record<string, [number, number]> = {
  北海道: [13, 0],
  青森県: [13, 1],
  秋田県: [12, 2],
  岩手県: [13, 2],
  山形県: [12, 3],
  宮城県: [13, 3],
  新潟県: [11, 4],
  福島県: [13, 4],
  石川県: [8, 5],
  富山県: [9, 5],
  長野県: [10, 5],
  群馬県: [11, 5],
  栃木県: [12, 5],
  茨城県: [13, 5],
  福井県: [8, 6],
  岐阜県: [9, 6],
  山梨県: [10, 6],
  埼玉県: [11, 6],
  東京都: [12, 6],
  千葉県: [13, 6],
  島根県: [4, 7],
  鳥取県: [5, 7],
  兵庫県: [6, 7],
  京都府: [7, 7],
  滋賀県: [8, 7],
  愛知県: [9, 7],
  静岡県: [10, 7],
  神奈川県: [12, 7],
  山口県: [3, 8],
  広島県: [4, 8],
  岡山県: [5, 8],
  大阪府: [6, 8],
  奈良県: [7, 8],
  三重県: [8, 8],
  佐賀県: [0, 9],
  福岡県: [1, 9],
  大分県: [2, 9],
  愛媛県: [4, 9],
  香川県: [5, 9],
  徳島県: [6, 9],
  和歌山県: [7, 9],
  長崎県: [0, 10],
  熊本県: [1, 10],
  宮崎県: [2, 10],
  高知県: [5, 10],
  鹿児島県: [1, 11],
  沖縄県: [0, 12],
};

/** 地方名を背景に置く位置（列, 行。小数可） */
const REGION_LABELS: { name: string; col: number; row: number }[] = [
  { name: "北海道・東北", col: 10.9, row: 2.5 },
  { name: "関東", col: 12.5, row: 8.15 },
  { name: "中部", col: 9, row: 4.35 },
  { name: "近畿", col: 7, row: 6.35 },
  { name: "中国", col: 4, row: 6.35 },
  { name: "四国", col: 5.5, row: 11.15 },
  { name: "九州", col: 1, row: 8.35 },
];

const COLS = 14;
const ROWS = 13;
const TILE = 46;
const GAP = 5;
const STEP = TILE + GAP;

export type MapTile = {
  /** 右上に出す小さな数字（未対応など）。無ければ出さない */
  badge?: number;
  /** 県名の下に出す短い文字（例: 39社） */
  sub?: string;
  /** ホバー時の説明 */
  title?: string;
};

/** その名前がタイルとして地図に載るか（「全国・その他」は載らない） */
export function hasTile(name: string): boolean {
  return name in TILE_POS;
}

/** 都道府県名から「県・府・都」を落とした短い表示名。北海道はそのまま */
export function shortPrefecture(name: string): string {
  if (name === "北海道") return name;
  return name.replace(/[都府県]$/, "");
}

export function JapanTileMap({
  tiles,
  selected,
  onSelect,
  accent = "#9e8d70",
}: {
  /** 選べる都道府県とその表示。ここに無い県は薄く出して押せない */
  tiles: Record<string, MapTile>;
  selected?: string | null;
  onSelect: (prefecture: string) => void;
  accent?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const gradActive = `jm-active-${uid}`;
  const gradSelected = `jm-selected-${uid}`;
  const shadow = `jm-shadow-${uid}`;
  const width = COLS * STEP - GAP;
  const height = ROWS * STEP - GAP;

  return (
    <svg
      viewBox={`-6 -6 ${width + 12} ${height + 12}`}
      className="h-auto w-full"
      role="group"
      aria-label="日本地図から都道府県を選ぶ"
    >
      <defs>
        <linearGradient id={gradActive} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbf3e3" />
          <stop offset="100%" stopColor="#ecdcbd" />
        </linearGradient>
        <linearGradient id={gradSelected} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#b3a283" />
          <stop offset="100%" stopColor={accent} />
        </linearGradient>
        <filter id={shadow} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.2" floodColor={accent} floodOpacity="0.35" />
        </filter>
        <style>{`
          .jm-tile { transition: transform 140ms ease, filter 140ms ease; transform-box: fill-box; transform-origin: center; }
          .jm-tile.is-active:hover { transform: translateY(-2px) scale(1.04); filter: brightness(0.98); }
          .jm-tile.is-active:active { transform: translateY(0) scale(0.98); }
        `}</style>
      </defs>

      {REGION_LABELS.map((r) => (
        <text
          key={r.name}
          x={r.col * STEP}
          y={r.row * STEP}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={9}
          letterSpacing={2}
          fill="#bfc3ca"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {r.name}
        </text>
      ))}

      {Object.entries(TILE_POS).map(([name, [col, row]]) => {
        const x = col * STEP;
        const y = row * STEP;
        const tile = tiles[name];
        const active = !!tile;
        const isSelected = selected === name;
        const label = shortPrefecture(name);
        const fontSize = label.length >= 4 ? 9.5 : label.length === 3 ? 11 : 12.5;
        const fill = isSelected ? `url(#${gradSelected})` : active ? `url(#${gradActive})` : "#f4f4f6";
        const stroke = isSelected ? accent : active ? "#d9c9a6" : "#e8e9ec";
        const textColor = isSelected ? "#ffffff" : active ? "#5a4a2f" : "#b8bcc3";
        const subColor = isSelected ? "rgba(255,255,255,0.85)" : "#9a8a6b";
        const hasSub = active && !!tile.sub;

        return (
          <g
            key={name}
            transform={`translate(${x}, ${y})`}
            onClick={active ? () => onSelect(name) : undefined}
            className={`jm-tile ${active ? "is-active cursor-pointer" : "cursor-default"}`}
            role={active ? "button" : undefined}
            aria-label={active ? `${name}${tile?.title ? `（${tile.title}）` : ""}` : `${name}（リスト未登録）`}
            filter={isSelected ? `url(#${shadow})` : undefined}
          >
            {active && <title>{tile.title ?? name}</title>}
            <rect width={TILE} height={TILE} rx={11} fill={fill} stroke={stroke} strokeWidth={isSelected ? 1.5 : 1} />
            <text
              x={TILE / 2}
              y={hasSub ? TILE / 2 - 4 : TILE / 2 + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={fontSize}
              fontWeight={active ? 600 : 400}
              fill={textColor}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {label}
            </text>
            {hasSub && (
              <text
                x={TILE / 2}
                y={TILE / 2 + 10}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={7.5}
                fontWeight={500}
                fill={subColor}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {tile.sub}
              </text>
            )}
            {active && typeof tile.badge === "number" && tile.badge > 0 && (
              <g style={{ pointerEvents: "none" }}>
                <circle cx={TILE - 3} cy={3} r={8.5} fill="#ffffff" />
                <circle cx={TILE - 3} cy={3} r={7} fill="#dc2626" />
                <text x={TILE - 3} y={3.5} textAnchor="middle" dominantBaseline="middle" fontSize={7.5} fontWeight={700} fill="#fff">
                  {tile.badge > 99 ? "99+" : tile.badge}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** 地方ごとの並び（一覧を地理順に出すとき用） */
export const REGIONS: { name: string; prefectures: string[] }[] = [
  { name: "北海道・東北", prefectures: ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"] },
  { name: "関東", prefectures: ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"] },
  { name: "中部", prefectures: ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県"] },
  { name: "近畿", prefectures: ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"] },
  { name: "中国・四国", prefectures: ["鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県"] },
  { name: "九州・沖縄", prefectures: ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"] },
];

/** 地理順（北→南）のインデックス。並べ替えに使う */
export function prefectureOrder(name: string): number {
  let i = 0;
  for (const r of REGIONS) {
    for (const p of r.prefectures) {
      if (p === name) return i;
      i++;
    }
  }
  return 999;
}
