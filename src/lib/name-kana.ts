// ---------------------------------------------------------------------------
// 代表取締役名のカタカナ読み
//
// アプローチリストの「代表取締役」欄に、名前の右側へカタカナ読みを添えるための仕組み。
// 読みは Claude API (claude-opus-5) にまとめて推定させ、approach_name_kana テーブルに
// 「名前 → 読み」で保存する。同じ名前は再取り込みしても再推定しない（テーブルを引くだけ）。
//
// 呼び出し元:
//   - syncList (src/lib/approach.ts) の取り込み後に fillMissingKana を best-effort で実行
//   - 一括バックフィルは scripts/backfill-name-kana.mjs（同じプロンプトを使う）
// ---------------------------------------------------------------------------

import Anthropic from "@anthropic-ai/sdk";
import { pool } from "./db";

const MODEL = "claude-opus-5";
/** 1回の API 呼び出しで読みを付ける名前の数 */
export const KANA_BATCH_SIZE = 80;

export const KANA_SYSTEM_PROMPT = `あなたは日本の会社の代表者名に読み仮名を付ける担当者です。
与えられた名前（多くは「姓 名」の形式）それぞれについて、日本で最も一般的な読みを全角カタカナで返してください。

ルール:
- 姓と名の間は全角スペース1つで区切る（例: 山田 太郎 → ヤマダ タロウ）。
- 元の名前にスペースが無くても、姓と名の切れ目が分かる場合は区切る。
- すでにカタカナ・ひらがな・アルファベットの名前は、カタカナに直せる部分はカタカナにし、それ以外はそのまま返す（外国人名はカタカナ表記のまま）。
- 「〓」は文字化けした外字です。前後から推測できる場合は最もありそうな読みにし（例: 〓橋 → タカハシ、〓藤 → サイトウ）、推測できない場合はその文字の読みを「？」にする。
- 括弧書き・役職・敬称（「代表取締役」「氏」「様」など）が含まれる場合は、それらを除いた本人の名前だけを読む。
- 会社名・団体名・肩書きだけで人名が含まれない場合は kana を null にする。
- 入力の順番どおりに、1つの name につき必ず1件返す。name は入力と完全に同じ文字列を返す。`;

export const KANA_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    readings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          kana: { type: ["string", "null"] },
        },
        required: ["name", "kana"],
        additionalProperties: false,
      },
    },
  },
  required: ["readings"],
  additionalProperties: false,
} as const;

/** ひらがな → カタカナ */
function hiraToKata(s: string): string {
  return s.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

/** 漢字も外字も含まない名前は API に投げず、そのまま（ひらがなはカタカナ化して）読みにする */
export function trivialKana(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (/[㐀-鿿\u{20000}-\u{2ffff}〓]/u.test(trimmed)) return null;
  return hiraToKata(trimmed);
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

/** 名前のリストに読みを付ける（1バッチ = 1回の API 呼び出し）。戻り値は name → kana */
export async function generateKanaBatch(names: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (names.length === 0) return out;

  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: KANA_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: JSON.stringify({ names }, null, 0),
      },
    ],
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: KANA_OUTPUT_SCHEMA },
    },
  });

  const text = res.content.find((b) => b.type === "text")?.text ?? "";
  const parsed = JSON.parse(text) as { readings: { name: string; kana: string | null }[] };
  for (const r of parsed.readings) {
    if (typeof r.name !== "string") continue;
    const kana = typeof r.kana === "string" ? r.kana.trim() : null;
    out.set(r.name, kana && kana.length > 0 ? kana : null);
  }
  return out;
}

/**
 * 読みが未登録の名前を探して読みを付け、approach_name_kana に保存する。
 * `names` を省略した場合は approach_companies 全体から未登録の名前を拾う。
 * `maxBatches` で 1 回の呼び出しで処理するバッチ数を制限できる（取り込み時のタイムアウト対策）。
 */
export async function fillMissingKana(opts: {
  names?: string[];
  maxBatches?: number;
  onProgress?: (done: number, total: number) => void;
} = {}): Promise<{ total: number; generated: number; skipped: number }> {
  let targets: string[];
  if (opts.names) {
    targets = [...new Set(opts.names.map((n) => n.trim()).filter(Boolean))];
    if (targets.length === 0) return { total: 0, generated: 0, skipped: 0 };
    const known = await pool.query(`SELECT name FROM approach_name_kana WHERE name = ANY($1::text[]);`, [targets]);
    const knownSet = new Set(known.rows.map((r: { name: string }) => r.name));
    targets = targets.filter((n) => !knownSet.has(n));
  } else {
    const res = await pool.query(
      `SELECT DISTINCT c.contact_name AS name
       FROM approach_companies c
       LEFT JOIN approach_name_kana k ON k.name = c.contact_name
       WHERE c.contact_name IS NOT NULL AND c.contact_name <> '' AND k.name IS NULL
       ORDER BY 1;`,
    );
    targets = res.rows.map((r: { name: string }) => r.name);
  }

  // 漢字を含まない名前は API を使わずに登録
  const trivial: [string, string][] = [];
  const needApi: string[] = [];
  for (const n of targets) {
    const t = trivialKana(n);
    if (t !== null) trivial.push([n, t]);
    else needApi.push(n);
  }
  await saveKana(trivial);

  const maxBatches = opts.maxBatches ?? Infinity;
  let generated = trivial.length;
  let done = 0;
  const total = needApi.length;
  for (let i = 0; i < needApi.length && i / KANA_BATCH_SIZE < maxBatches; i += KANA_BATCH_SIZE) {
    const batch = needApi.slice(i, i + KANA_BATCH_SIZE);
    const result = await generateKanaBatch(batch);
    const rows: [string, string | null][] = batch.map((n) => [n, result.get(n) ?? null]);
    // 返ってこなかった名前は登録しない（次回また試す）
    const found = rows.filter(([n]) => result.has(n));
    await saveKana(found);
    generated += found.length;
    done += batch.length;
    opts.onProgress?.(done, total);
  }

  return { total: targets.length, generated, skipped: targets.length - generated };
}

async function saveKana(rows: [string, string | null][]): Promise<void> {
  if (rows.length === 0) return;
  const values: string[] = [];
  const params: (string | null)[] = [];
  rows.forEach(([name, kana], i) => {
    values.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
    params.push(name, kana);
  });
  await pool.query(
    `INSERT INTO approach_name_kana (name, kana) VALUES ${values.join(", ")}
     ON CONFLICT (name) DO UPDATE SET kana = EXCLUDED.kana;`,
    params,
  );
}
