// 動画研修の1本の id とタイトルを直す小スクリプト。
// 使い方: node --env-file=.env.local scripts/rename-elearning-video.mjs
// 視聴の記録（elearning_progress）も同じ id に付け替える。
import pg from "pg";

const FROM_ID = "callforce-aikaden-empaty-closing";
const TO = {
  id: "callforce-aikaden-xaiondata-closing",
  // 同じ商談のヒアリング（callforce-aikaden-xaiondata）と会社名・テーマの書き方を揃える
  title: "株式会社XAIONDATA｜クロージング（採用データサービスの新規開拓に向けたAIテレアポ導入）",
};

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const client = await pool.connect();
try {
  await client.query("BEGIN");
  const cur = await client.query(`SELECT id FROM elearning_videos WHERE id = $1`, [FROM_ID]);
  if (!cur.rows.length) {
    console.log("not found:", FROM_ID);
  } else {
    const prog = await client.query(`UPDATE elearning_progress SET video_id = $1 WHERE video_id = $2`, [TO.id, FROM_ID]);
    await client.query(`UPDATE elearning_videos SET id = $1, title = $2 WHERE id = $3`, [TO.id, TO.title, FROM_ID]);
    console.log("progress rows moved:", prog.rowCount);
  }
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
}

const rows = await pool.query(
  `SELECT id, title, episode_label, url FROM elearning_videos WHERE course = 'callforce' AND section_id = 2 AND id LIKE 'callforce-aikaden-xaiondata%' ORDER BY id`
);
const total = await pool.query(`SELECT count(*)::int AS n FROM elearning_videos`);
console.log("total:", total.rows[0].n);
for (const r of rows.rows) console.log(JSON.stringify(r));
await pool.end();
