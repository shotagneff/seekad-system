// ロールと、ロールごとに見られる範囲の定義。
//
// DB にも Cookie にも依存しないので、サーバ・クライアントの双方から読める。
// 判定を1箇所に集めておかないと、サイドバーの出し分けと proxy の遮断がずれて
// 「メニューには出るのに開けない」「隠したつもりが API から取れる」が起きる。

export const ROLES = ["admin", "lead_access", "user"] as const;

export type Role = (typeof ROLES)[number];

/** 画面に出すロール名 */
export const ROLE_LABEL: Record<Role, string> = {
  admin: "管理者",
  lead_access: "反響解除",
  user: "一般",
};

/**
 * ロールの並び順（権限の広い順）。ユーザー管理の選択肢はこの順で出す。
 */
export const ROLE_ORDER: Role[] = ["admin", "lead_access", "user"];

/** 不明な値を安全に Role へ寄せる。DB や API の入力を通すときに使う */
export function toRole(value: unknown): Role {
  return ROLES.includes(value as Role) ? (value as Role) : "user";
}

/**
 * 一般社員には見せない画面。
 *
 * 管理メニューには移さず、サイドバーの元の位置に置いたままにする。
 * 権限のない人には薄く表示して押せなくし、URL を直接叩かれた場合は
 * proxy が /forbidden を描画する（URL は元のまま）。
 */
export const RESTRICTED_PAGES = [
  "/leads",       // 反響リード
  "/nurturing",   // ナーチャリング
  "/performance", // 成績
  "/dashboard",   // 売上・KPIダッシュボード
] as const;

/**
 * あわせて塞ぐ API。
 *
 * 画面だけ隠しても、API を直接叩けば中身は取れてしまう。
 *
 * ここに `/api/sales` は入れない。成績（/performance）が使う API だが、
 * アポ獲得管理とホームの「今日のアポイント」も同じ API を使っており、
 * どちらも一般社員に開放している画面だからである。
 * 成績は同じデータの集計ビューなので、画面を塞げば目的は足りる。
 */
export const RESTRICTED_APIS = [
  "/api/leads",
  "/api/nurturing",
] as const;

/** その画面・API が、権限を持つ人だけのものか */
export function isRestrictedPath(pathname: string): boolean {
  const targets: readonly string[] = [...RESTRICTED_PAGES, ...RESTRICTED_APIS];
  return targets.some(
    (target) => pathname === target || pathname.startsWith(`${target}/`),
  );
}

/** 制限のかかった画面を見られるか */
export function canViewRestricted(role: Role | string | null | undefined): boolean {
  return role === "admin" || role === "lead_access";
}

/**
 * AI研修（動画研修の「AI研修」コース）を見られるか。
 *
 * ロールではなく、ユーザー管理の「AI研修解禁」チェック（igos_users.ai_training_unlocked）で
 * 人ごとに開ける。管理者はチェックに関係なく見られる。
 */
export function canViewAiTraining(
  role: Role | string | null | undefined,
  aiTrainingUnlocked: boolean | null | undefined,
): boolean {
  return role === "admin" || aiTrainingUnlocked === true;
}

/** 管理メニュー（/admin/*）を使えるか */
export function canManage(role: Role | string | null | undefined): boolean {
  return role === "admin";
}
