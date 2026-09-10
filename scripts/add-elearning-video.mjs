// 動画研修に1本追加する小スクリプト。
// 使い方: node --env-file=.env.local scripts/add-elearning-video.mjs
// 追加内容は下の VIDEO を書き換える。同じ id / 同じ URL があれば何もしない。
import pg from "pg";

const VIDEO = {
  id: "callforce-aikaden-afn",
  title: "有限会社エーエフエヌ｜ヒアリング（PR掲載の打診のAI架電導入検討）",
  category: "AI架電",
  url: "https://youtu.be/5v0SzYOsY8w",
  course: "callforce",
  sectionId: 2,
  episodeLabel: "ヒアリング",
};

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const before = await pool.query(`SELECT count(*)::int AS n FROM elearning_videos`);
const dup = await pool.query(
  `SELECT id, title FROM elearning_videos WHERE id = $1 OR url LIKE $2`,
  [VIDEO.id, `%${VIDEO.url.split("/").pop()}%`]
);
if (dup.rows.length) {
  console.log("already exists:", dup.rows);
} else {
  await pool.query(
    `INSERT INTO elearning_videos
       (id, title, category, url, course, section_id, episode_label, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [VIDEO.id, VIDEO.title, VIDEO.category, VIDEO.url, VIDEO.course, VIDEO.sectionId, VIDEO.episodeLabel]
  );
}
const after = await pool.query(`SELECT count(*)::int AS n FROM elearning_videos`);
const row = await pool.query(
  `SELECT id, title, category, course, section_id, episode_label, url FROM elearning_videos WHERE id = $1`,
  [VIDEO.id]
);
console.log("before:", before.rows[0].n, "after:", after.rows[0].n);
console.log(JSON.stringify(row.rows[0]));
await pool.end();
