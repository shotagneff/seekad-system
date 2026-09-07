// AI研修（動画研修の「AI研修」コース）の閲覧可否をサーバ側で判定する。
//
// 画面で隠すだけでは /api/e-learning/videos から動画URLが取れてしまうので、
// API 側でもここを通して AI研修の動画を落とす。
// 判定のルール自体は roles.ts の canViewAiTraining にある。
import type { NextRequest } from "next/server";
import { pool, hasDatabase } from "./db";
import { verifySessionToken } from "./auth-token";
import { ensureUsersTable } from "./schema";
import { canViewAiTraining } from "./roles";

const COOKIE_NAME = "igos_session";

/** igos_users の「AI研修解禁」を読む。ユーザーが無ければ false */
export async function readAiTrainingUnlocked(loginId: string | null | undefined): Promise<boolean> {
  if (!loginId || !hasDatabase()) return false;
  await ensureUsersTable();
  const res = await pool.query(
    `SELECT ai_training_unlocked AS "unlocked" FROM igos_users WHERE login_id = $1 AND active = TRUE LIMIT 1;`,
    [loginId],
  );
  return (res.rows[0] as { unlocked?: boolean } | undefined)?.unlocked === true;
}

/** リクエストの Cookie から、その人が AI研修を見られるかを返す */
export async function canViewAiTrainingFor(req: NextRequest): Promise<boolean> {
  const secret = String(process.env.IGOS_AUTH_SECRET ?? "").trim();
  if (!secret) return false;
  const token = req.cookies.get(COOKIE_NAME)?.value ?? "";
  const payload = token ? await verifySessionToken(token, secret) : null;
  if (!payload) return false;
  if (payload.role === "admin") return true;
  return canViewAiTraining(payload.role, await readAiTrainingUnlocked(payload.loginId));
}
