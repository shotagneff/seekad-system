import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ensureUsersTable } from "@/lib/schema";
import { hashPassword } from "@/lib/password";
import { toRole, type Role } from "@/lib/roles";

export const runtime = "nodejs";

const USERS_TABLE = "igos_users";

// team / jobTitle / iconUrl は、2026-09-02 に廃止した members テーブルから
// 引き継いだ名簿の情報。jobTitle は職種（長期インターン等）で、
// 権限の role とは別物。
type UserRow = {
  loginId: string;
  displayName?: string;
  role: Role;
  team?: string | null;
  jobTitle?: string | null;
  iconUrl?: string | null;
  active: boolean;
  /** AI研修を見られるか（ユーザー管理の「AI研修解禁」） */
  aiTrainingUnlocked: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json([]);
  await ensureUsersTable();

  const result = await pool.query(
    `SELECT
      login_id AS "loginId",
      display_name AS "displayName",
      role,
      team,
      job_title AS "jobTitle",
      icon_url AS "iconUrl",
      active,
      ai_training_unlocked AS "aiTrainingUnlocked",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM ${USERS_TABLE}
    ORDER BY active DESC, role ASC, login_id ASC;`,
  );

  return NextResponse.json(result.rows as UserRow[]);
}

export async function POST(req: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 500 });
  }
  await ensureUsersTable();

  const body = (await req.json().catch(() => ({}))) as {
    loginId?: string;
    displayName?: string;
    password?: string;
    role?: Role;
    team?: string;
    jobTitle?: string;
    iconUrl?: string;
    active?: boolean;
    aiTrainingUnlocked?: boolean;
  };

  const loginId = String(body.loginId ?? "").trim();
  const displayName = String(body.displayName ?? "").trim() || null;
  const password = String(body.password ?? "").trim();
  const aiTrainingUnlocked = body.aiTrainingUnlocked === true;
  const role: Role = toRole(body.role);
  const team = String(body.team ?? "").trim() || null;
  const jobTitle = String(body.jobTitle ?? "").trim() || null;
  const iconUrl = String(body.iconUrl ?? "").trim() || null;
  const active = body.active !== false;

  if (!loginId || !password) {
    return NextResponse.json({ ok: false, error: "loginId and password are required" }, { status: 400 });
  }

  const passwordHash = hashPassword(password);

  await pool.query(
    `INSERT INTO ${USERS_TABLE}
      (login_id, password_hash, display_name, role, team, job_title, icon_url, active, ai_training_unlocked, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
     ON CONFLICT (login_id) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      display_name = EXCLUDED.display_name,
      role = EXCLUDED.role,
      team = EXCLUDED.team,
      job_title = EXCLUDED.job_title,
      icon_url = EXCLUDED.icon_url,
      active = EXCLUDED.active,
      ai_training_unlocked = EXCLUDED.ai_training_unlocked,
      updated_at = NOW();`,
    [loginId, passwordHash, displayName, role, team, jobTitle, iconUrl, active, aiTrainingUnlocked],
  );

  return NextResponse.json({ ok: true, loginId });
}

export async function PUT(req: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 500 });
  }
  await ensureUsersTable();

  const body = (await req.json().catch(() => ({}))) as {
    loginId?: string;
    displayName?: string;
    password?: string;
    role?: Role;
    team?: string;
    jobTitle?: string;
    iconUrl?: string;
    active?: boolean;
    aiTrainingUnlocked?: boolean;
  };

  const loginId = String(body.loginId ?? "").trim();
  if (!loginId) {
    return NextResponse.json({ ok: false, error: "loginId is required" }, { status: 400 });
  }

  const role: Role = toRole(body.role);
  const active = body.active !== false;
  const password = String(body.password ?? "").trim();
  const displayName = String(body.displayName ?? "").trim() || null;
  const team = String(body.team ?? "").trim() || null;
  const jobTitle = String(body.jobTitle ?? "").trim() || null;
  const iconUrl = String(body.iconUrl ?? "").trim() || null;
  // 送られてこなければ今の値を保つ（PW変更などで解禁が外れないように）
  const aiTrainingUnlocked: boolean | null =
    typeof body.aiTrainingUnlocked === "boolean" ? body.aiTrainingUnlocked : null;

  if (password) {
    const passwordHash = hashPassword(password);
    await pool.query(
      `UPDATE ${USERS_TABLE} SET
        password_hash = $2,
        display_name = $3,
        role = $4,
        team = $5,
        job_title = $6,
        icon_url = $7,
        active = $8,
        ai_training_unlocked = COALESCE($9, ai_training_unlocked),
        updated_at = NOW()
      WHERE login_id = $1;`,
      [loginId, passwordHash, displayName, role, team, jobTitle, iconUrl, active, aiTrainingUnlocked],
    );
  } else {
    await pool.query(
      `UPDATE ${USERS_TABLE} SET
        display_name = $2,
        role = $3,
        team = $4,
        job_title = $5,
        icon_url = $6,
        active = $7,
        ai_training_unlocked = COALESCE($8, ai_training_unlocked),
        updated_at = NOW()
      WHERE login_id = $1;`,
      [loginId, displayName, role, team, jobTitle, iconUrl, active, aiTrainingUnlocked],
    );
  }

  return NextResponse.json({ ok: true, loginId });
}

export async function DELETE(req: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured" }, { status: 500 });
  }
  await ensureUsersTable();

  const { searchParams } = new URL(req.url);
  const loginId = String(searchParams.get("loginId") ?? "").trim();
  if (!loginId) {
    return NextResponse.json({ ok: false, error: "loginId is required" }, { status: 400 });
  }

  await pool.query(`DELETE FROM ${USERS_TABLE} WHERE login_id = $1;`, [loginId]);
  return NextResponse.json({ ok: true });
}
