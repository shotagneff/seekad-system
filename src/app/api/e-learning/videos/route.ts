import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ensureElearningVideosTable } from "@/lib/schema";
import { canViewAiTrainingFor } from "@/lib/ai-training";

/** AI研修の動画は、ユーザー管理で「AI研修解禁」にした人（と管理者）にだけ返す */
const AI_COURSE = "ai";

export async function GET(req: NextRequest) {
  await ensureElearningVideosTable();
  const showAi = await canViewAiTrainingFor(req);

  const result = await pool.query(
    `SELECT
      id,
      title,
      category,
      url,
      cover_image_url AS "coverImageUrl",
      course,
      section_id AS "sectionId",
      episode_label AS "episodeLabel",
      duration_minutes AS "durationMinutes",
      instructor_id AS "instructorId",
      instructor_name AS "instructorName",
      material_label AS "materialLabel",
      material_url AS "materialUrl",
      updated_at AS "updatedAt"
    FROM elearning_videos
    ORDER BY section_id NULLS LAST, episode_label NULLS LAST, updated_at ASC;`
  );

  const rows = showAi ? result.rows : result.rows.filter((v: { course?: string | null }) => v.course !== AI_COURSE);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  await ensureElearningVideosTable();

  const body = await req.json();
  const {
    id,
    title,
    category,
    url,
    coverImageUrl,
    course,
    sectionId,
    episodeLabel,
    durationMinutes,
    instructorId,
    instructorName,
    materialLabel,
    materialUrl,
  } = body ?? {};

  if (!id || !title || !url) {
    return NextResponse.json({ error: "id, title, url は必須です" }, { status: 400 });
  }

  await pool.query(
    `INSERT INTO elearning_videos (
      id,
      title,
      category,
      url,
      cover_image_url,
      course,
      section_id,
      episode_label,
      duration_minutes,
      instructor_id,
      instructor_name,
      material_label,
      material_url,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      category = EXCLUDED.category,
      url = EXCLUDED.url,
      cover_image_url = EXCLUDED.cover_image_url,
      course = EXCLUDED.course,
      section_id = EXCLUDED.section_id,
      episode_label = EXCLUDED.episode_label,
      duration_minutes = EXCLUDED.duration_minutes,
      instructor_id = EXCLUDED.instructor_id,
      instructor_name = EXCLUDED.instructor_name,
      material_label = EXCLUDED.material_label,
      material_url = EXCLUDED.material_url,
      updated_at = NOW();`,
    [
      id,
      title,
      category,
      url,
      coverImageUrl,
      course ?? 'onboarding',
      sectionId,
      episodeLabel,
      durationMinutes,
      instructorId ?? null,
      instructorName,
      materialLabel,
      materialUrl,
    ]
  );

  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  await ensureElearningVideosTable();

  const body = await req.json();
  const {
    id,
    title,
    category,
    url,
    coverImageUrl,
    course,
    sectionId,
    episodeLabel,
    durationMinutes,
    instructorId,
    instructorName,
    materialLabel,
    materialUrl,
  } = body ?? {};

  if (!id) {
    return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  }

  await pool.query(
    `UPDATE elearning_videos
     SET
       title = COALESCE($2, title),
       category = COALESCE($3, category),
       url = COALESCE($4, url),
       cover_image_url = COALESCE($5, cover_image_url),
       course = COALESCE($6, course),
       section_id = COALESCE($7, section_id),
       episode_label = COALESCE($8, episode_label),
       duration_minutes = COALESCE($9, duration_minutes),
       instructor_id = COALESCE($10, instructor_id),
       instructor_name = COALESCE($11, instructor_name),
       material_label = COALESCE($12, material_label),
       material_url = COALESCE($13, material_url),
       updated_at = NOW()
     WHERE id = $1;`,
    [
      id,
      title,
      category,
      url,
      coverImageUrl,
      course,
      sectionId,
      episodeLabel,
      durationMinutes,
      instructorId ?? null,
      instructorName,
      materialLabel,
      materialUrl,
    ]
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  await ensureElearningVideosTable();

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  }

  await pool.query(`DELETE FROM elearning_videos WHERE id = $1;`, [id]);

  return NextResponse.json({ ok: true });
}
