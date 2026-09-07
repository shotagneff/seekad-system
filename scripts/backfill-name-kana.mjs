// 代表取締役名のカタカナ読みを一括で付けるバックフィルスクリプト。
//
// 使い方（プロジェクト直下で）:
//   node --env-file=.env.local scripts/backfill-name-kana.mjs            # 未登録ぶんを全部
//   node --env-file=.env.local scripts/backfill-name-kana.mjs --limit 5  # 最初の5件だけ（動作確認用）
//   node --env-file=.env.local scripts/backfill-name-kana.mjs --concurrency 4  # 同時に投げるバッチ数（既定 4）
//
// 1バッチ（80名）で 1 分前後かかるので、数千名なら並列で回す。途中で止めても
// 保存済みの名前は次回スキップされる（再実行して問題ない）。
//
// approach_companies.contact_name のうち approach_name_kana に無い名前を拾い、
// Claude API (claude-opus-5) で読みを推定して approach_name_kana に保存する。
// プロンプトとスキーマは src/lib/name-kana.ts と同じ内容にしておくこと（Next.js 外から
// TS を直接 import できないため、ここに複製している）。

import Anthropic from "@anthropic-ai/sdk";
import pg from "pg";

const MODEL = "claude-opus-5";
const BATCH_SIZE = 80;

const SYSTEM_PROMPT = `あなたは日本の会社の代表者名に読み仮名を付ける担当者です。
与えられた名前（多くは「姓 名」の形式）それぞれについて、日本で最も一般的な読みを全角カタカナで返してください。

ルール:
- 姓と名の間は全角スペース1つで区切る（例: 山田 太郎 → ヤマダ タロウ）。
- 元の名前にスペースが無くても、姓と名の切れ目が分かる場合は区切る。
- すでにカタカナ・ひらがな・アルファベットの名前は、カタカナに直せる部分はカタカナにし、それ以外はそのまま返す（外国人名はカタカナ表記のまま）。
- 「〓」は文字化けした外字です。前後から推測できる場合は最もありそうな読みにし（例: 〓橋 → タカハシ、〓藤 → サイトウ）、推測できない場合はその文字の読みを「？」にする。
- 括弧書き・役職・敬称（「代表取締役」「氏」「様」など）が含まれる場合は、それらを除いた本人の名前だけを読む。
- 会社名・団体名・肩書きだけで人名が含まれない場合は kana を null にする。
- 入力の順番どおりに、1つの name につき必ず1件返す。name は入力と完全に同じ文字列を返す。`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    readings: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, kana: { type: ["string", "null"] } },
        required: ["name", "kana"],
        additionalProperties: false,
      },
    },
  },
  required: ["readings"],
  additionalProperties: false,
};

const hiraToKata = (s) => s.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
const trivialKana = (name) => {
  const t = name.trim();
  if (!t) return null;
  if (/[㐀-鿿\u{20000}-\u{2ffff}〓]/u.test(t)) return null;
  return hiraToKata(t);
};

const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
const concIdx = args.indexOf("--concurrency");
const concurrency = concIdx >= 0 ? Math.max(1, Number(args[concIdx + 1])) : 4;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const anthropic = new Anthropic();

async function saveKana(rows) {
  if (rows.length === 0) return;
  const values = [];
  const params = [];
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

async function generateBatch(names) {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify({ names }) }],
    output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
  });
  const text = res.content.find((b) => b.type === "text")?.text ?? "";
  const parsed = JSON.parse(text);
  const out = new Map();
  for (const r of parsed.readings) {
    if (typeof r.name !== "string") continue;
    const kana = typeof r.kana === "string" ? r.kana.trim() : null;
    out.set(r.name, kana && kana.length > 0 ? kana : null);
  }
  return { out, usage: res.usage };
}

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS approach_name_kana (
      name TEXT PRIMARY KEY,
      kana TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`);
  const res = await pool.query(
    `SELECT DISTINCT c.contact_name AS name
     FROM approach_companies c
     LEFT JOIN approach_name_kana k ON k.name = c.contact_name
     WHERE c.contact_name IS NOT NULL AND c.contact_name <> '' AND k.name IS NULL
     ORDER BY 1;`,
  );
  let targets = res.rows.map((r) => r.name);
  if (Number.isFinite(limit)) targets = targets.slice(0, limit);
  console.log(`未登録: ${targets.length} 件`);

  const trivial = [];
  const needApi = [];
  for (const n of targets) {
    const t = trivialKana(n);
    if (t !== null) trivial.push([n, t]);
    else needApi.push(n);
  }
  await saveKana(trivial);
  console.log(`漢字なし（API不要）: ${trivial.length} 件 / API対象: ${needApi.length} 件`);

  let done = 0;
  let missing = 0;
  let inTok = 0;
  let outTok = 0;
  const batches = [];
  for (let i = 0; i < needApi.length; i += BATCH_SIZE) batches.push(needApi.slice(i, i + BATCH_SIZE));

  const runBatch = async (batch, idx) => {
    let result;
    try {
      result = await generateBatch(batch);
    } catch (e) {
      console.error(`バッチ ${idx + 1} 失敗:`, e.message ?? e);
      await new Promise((r) => setTimeout(r, 5000));
      try {
        result = await generateBatch(batch);
      } catch (e2) {
        console.error(`バッチ ${idx + 1} 再試行も失敗。スキップ:`, e2.message ?? e2);
        return;
      }
    }
    const rows = batch.filter((n) => result.out.has(n)).map((n) => [n, result.out.get(n)]);
    missing += batch.length - rows.length;
    await saveKana(rows);
    done += batch.length;
    inTok += result.usage?.input_tokens ?? 0;
    outTok += result.usage?.output_tokens ?? 0;
    console.log(`${done}/${needApi.length}  (未返答 ${missing}, tokens in=${inTok} out=${outTok})`);
    if (Number.isFinite(limit)) {
      for (const [n, k] of rows) console.log(`  ${n} → ${k}`);
    }
  };

  // concurrency 本のワーカーでバッチを順に消化する
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const idx = next++;
      await runBatch(batches[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));

  const cnt = await pool.query(`SELECT COUNT(*)::int AS n, COUNT(kana)::int AS with_kana FROM approach_name_kana;`);
  console.log(`approach_name_kana: ${cnt.rows[0].n} 件（読みあり ${cnt.rows[0].with_kana}）`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
