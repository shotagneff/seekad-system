import { pool } from "@/lib/db";

// ---------------------------------------------------------------------------
// igos_users
// ---------------------------------------------------------------------------
/**
 * 社員はこのテーブル1本で管理する。
 *
 * 以前は別に members テーブルがあり、同じ人が別IDで両方に載っていた
 * （宅間さんが igos_users では 000017、members では takuma）。
 * その結果「平賀さんは members にしかいない」「中舎さん・桐髙さんは
 * igos_users にしかいない」というずれが生まれ、出勤スケジュールに
 * 2人しか出ていなかった（2026-09-02 に統合）。
 *
 * ログイン情報（login_id / password_hash / role）と、名簿としての情報
 * （display_name / team / job_title / icon_url）を同じ行に持つ。
 *
 * ※ `role` は**権限**（admin / lead_access / user）。
 *   職種（長期インターン等）は `job_title` に入れる。混同しないこと。
 */
export async function ensureUsersTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS igos_users (
      login_id TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE igos_users ADD COLUMN IF NOT EXISTS password_hash TEXT;`);
  await pool.query(`ALTER TABLE igos_users ADD COLUMN IF NOT EXISTS display_name TEXT;`);
  await pool.query(`ALTER TABLE igos_users ADD COLUMN IF NOT EXISTS role TEXT;`);
  await pool.query(`ALTER TABLE igos_users ADD COLUMN IF NOT EXISTS active BOOLEAN;`);
  await pool.query(`ALTER TABLE igos_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE igos_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;`);
  // 旧 members から引き継いだ名簿の情報
  await pool.query(`ALTER TABLE igos_users ADD COLUMN IF NOT EXISTS team TEXT;`);
  await pool.query(`ALTER TABLE igos_users ADD COLUMN IF NOT EXISTS job_title TEXT;`);
  await pool.query(`ALTER TABLE igos_users ADD COLUMN IF NOT EXISTS icon_url TEXT;`);
}

// ---------------------------------------------------------------------------
// announcements
// ---------------------------------------------------------------------------
export async function ensureAnnouncementsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT,
      cover_image_url TEXT,
      link_url TEXT,
      published_at DATE,
      author_member_id TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query("ALTER TABLE announcements ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';");
  await pool.query("ALTER TABLE announcements ADD COLUMN IF NOT EXISTS body TEXT NOT NULL DEFAULT '';");
  await pool.query('ALTER TABLE announcements ADD COLUMN IF NOT EXISTS category TEXT;');
  await pool.query('ALTER TABLE announcements ADD COLUMN IF NOT EXISTS cover_image_url TEXT;');
  await pool.query('ALTER TABLE announcements ADD COLUMN IF NOT EXISTS link_url TEXT;');
  await pool.query('ALTER TABLE announcements ADD COLUMN IF NOT EXISTS published_at DATE;');
  await pool.query('ALTER TABLE announcements ADD COLUMN IF NOT EXISTS author_member_id TEXT;');
  await pool.query('ALTER TABLE announcements ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;');
  await pool.query('ALTER TABLE announcements ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();');
  await pool.query('ALTER TABLE announcements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();');
}

// ---------------------------------------------------------------------------
// admin_events
// ---------------------------------------------------------------------------
export async function ensureAdminEventsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_events (
      id TEXT PRIMARY KEY,
      company_name TEXT,
      program_name TEXT,
      date TEXT,
      place TEXT,
      venue TEXT,
      type TEXT,
      industries TEXT,
      concept_summary TEXT,
      company_count INTEGER,
      capacity INTEGER,
      target TEXT,
      reserve_url TEXT,
      time TEXT,
      line_keyword TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query('ALTER TABLE admin_events ADD COLUMN IF NOT EXISTS company_name TEXT;');
  await pool.query('ALTER TABLE admin_events ADD COLUMN IF NOT EXISTS program_name TEXT;');
  await pool.query('ALTER TABLE admin_events ADD COLUMN IF NOT EXISTS date TEXT;');
  await pool.query('ALTER TABLE admin_events ADD COLUMN IF NOT EXISTS place TEXT;');
  await pool.query('ALTER TABLE admin_events ADD COLUMN IF NOT EXISTS venue TEXT;');
  await pool.query('ALTER TABLE admin_events ADD COLUMN IF NOT EXISTS type TEXT;');
  await pool.query('ALTER TABLE admin_events ADD COLUMN IF NOT EXISTS industries TEXT;');
  await pool.query('ALTER TABLE admin_events ADD COLUMN IF NOT EXISTS concept_summary TEXT;');
  await pool.query('ALTER TABLE admin_events ADD COLUMN IF NOT EXISTS company_count INTEGER;');
  await pool.query('ALTER TABLE admin_events ADD COLUMN IF NOT EXISTS capacity INTEGER;');
  await pool.query('ALTER TABLE admin_events ADD COLUMN IF NOT EXISTS target TEXT;');
  await pool.query('ALTER TABLE admin_events ADD COLUMN IF NOT EXISTS reserve_url TEXT;');
  await pool.query('ALTER TABLE admin_events ADD COLUMN IF NOT EXISTS time TEXT;');
  await pool.query('ALTER TABLE admin_events ADD COLUMN IF NOT EXISTS line_keyword TEXT;');
  await pool.query('ALTER TABLE admin_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();');
}

// ---------------------------------------------------------------------------
// elearning_videos
// ---------------------------------------------------------------------------
export async function ensureElearningVideosTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS elearning_videos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT,
      url TEXT NOT NULL,
      cover_image_url TEXT,
      course TEXT NOT NULL DEFAULT 'onboarding',
      section_id INTEGER,
      episode_label TEXT,
      duration_minutes INTEGER,
      instructor_id TEXT,
      instructor_name TEXT,
      material_label TEXT,
      material_url TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query('ALTER TABLE elearning_videos ADD COLUMN IF NOT EXISTS material_label TEXT;');
  await pool.query('ALTER TABLE elearning_videos ADD COLUMN IF NOT EXISTS material_url TEXT;');
  await pool.query('ALTER TABLE elearning_videos ADD COLUMN IF NOT EXISTS instructor_id TEXT;');
  await pool.query('ALTER TABLE elearning_videos ADD COLUMN IF NOT EXISTS section_id INTEGER;');
  await pool.query("ALTER TABLE elearning_videos ADD COLUMN IF NOT EXISTS course TEXT NOT NULL DEFAULT 'onboarding';");
}

// ---------------------------------------------------------------------------
// elearning_progress
// ---------------------------------------------------------------------------
export async function ensureElearningProgressTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS elearning_progress (
      login_id TEXT NOT NULL,
      video_id TEXT NOT NULL,
      watched BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (login_id, video_id)
    );
  `);

  await pool.query("ALTER TABLE elearning_progress ADD COLUMN IF NOT EXISTS watched BOOLEAN NOT NULL DEFAULT FALSE;");
  await pool.query("ALTER TABLE elearning_progress ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();");
}

// ---------------------------------------------------------------------------
// documents
// ---------------------------------------------------------------------------
export async function ensureDocumentsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT,
      note TEXT,
      url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

// ---------------------------------------------------------------------------
// アポ獲得管理（リード → 案件 → 顧客）
//
// スプレッドシート「アポイント獲得」からの移管。
// 3つのシートが 案件ID で連鎖していた構造をそのまま持ち込む。
//
//   sales_leads(案件ID) ─┬─> sales_deals(同じ案件ID) ─┬─> sales_customers(元案件ID)
//                        │                            └─> 失注管理（= 失注フェーズの案件。別テーブルにしない）
//
// 計算で出る値（想定年間総額・契約経過月数・LTV等）は列に持たない。
// 保存すると元の値が変わったときに古いまま残る。
// ---------------------------------------------------------------------------
export async function ensureSalesLeadsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_leads (
      id INTEGER PRIMARY KEY,
      month_label TEXT,
      company TEXT,
      owner TEXT,
      phase TEXT NOT NULL DEFAULT 'リード',
      grade TEXT,
      registered_on DATE,
      ceo_name TEXT,
      contact_name TEXT,
      contact_title TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      industry TEXT,
      employee_size TEXT,
      prefecture TEXT,
      next_action TEXT,
      next_action_on DATE,
      lead_source TEXT,
      referrer TEXT,
      updated_on DATE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_sales_leads_owner ON sales_leads (owner);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_sales_leads_registered ON sales_leads (registered_on);');
  // アポ/次アクションの時刻（"HH:MM"）。ホームの「今日のアポ」で何時かを出すため
  await pool.query('ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS next_action_time TEXT;');
  // 商談メモ。案件化したときに案件側へそのまま引き継ぐ
  await pool.query('ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS note TEXT;');
}

export async function ensureSalesDealsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_deals (
      id INTEGER PRIMARY KEY,
      company TEXT,
      owner TEXT,
      phase TEXT NOT NULL DEFAULT '提案',
      win_probability INTEGER,
      next_action TEXT,
      next_action_on DATE,
      proposed_on DATE,
      monthly_fee INTEGER NOT NULL DEFAULT 0,
      one_time_fee INTEGER NOT NULL DEFAULT 0,
      competitor TEXT,
      service TEXT,
      referrer TEXT,
      lost_reason TEXT,
      won_on DATE,
      lost_on DATE,
      created_on DATE,
      updated_on DATE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_sales_deals_owner ON sales_deals (owner);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_sales_deals_won ON sales_deals (won_on);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_sales_deals_lost ON sales_deals (lost_on);');
  // リードから引き継いだ商談メモ。案件化のあとはこちらで書き足していく
  await pool.query('ALTER TABLE sales_deals ADD COLUMN IF NOT EXISTS note TEXT;');
}

export async function ensureSalesCustomersTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_customers (
      id TEXT PRIMARY KEY,
      company TEXT,
      owner TEXT,
      status TEXT NOT NULL DEFAULT '稼働',
      started_on DATE,
      monthly_fee INTEGER NOT NULL DEFAULT 0,
      ceo_name TEXT,
      industry TEXT,
      employee_size TEXT,
      location TEXT,
      note TEXT,
      deal_id INTEGER,
      created_on DATE,
      updated_on DATE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_sales_customers_deal ON sales_customers (deal_id);');
}

// ---------------------------------------------------------------------------
// 出勤スケジュール（曜日デフォルト + 日別上書き）
// ---------------------------------------------------------------------------
// アポ獲得管理のリードに紐づく商談録音（1回目/2回目/3回目）。本体は Vercel Blob、ここはメタ情報。
export async function ensureSalesRecordingsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_recordings (
      lead_id INTEGER NOT NULL,
      slot INTEGER NOT NULL,
      url TEXT NOT NULL,
      pathname TEXT,
      filename TEXT,
      content_type TEXT,
      size_bytes BIGINT,
      uploaded_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (lead_id, slot)
    );
  `);
}

export async function ensureAttendanceTables(): Promise<void> {
  // 曜日ごとの出勤開始時刻。weekday は JS getDay()（0=日 .. 6=土）。
  // start_time が null / 空 は「休み・未設定」。
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance_weekly (
      member_id  TEXT NOT NULL,
      weekday    INTEGER NOT NULL,
      start_time TEXT,
      PRIMARY KEY (member_id, weekday)
    );
  `);
  // 特定日の上書き。is_off=true はその日だけ休み。
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance_override (
      member_id  TEXT NOT NULL,
      date       TEXT NOT NULL,
      start_time TEXT,
      is_off     BOOLEAN NOT NULL DEFAULT FALSE,
      PRIMARY KEY (member_id, date)
    );
  `);
}

// ---------------------------------------------------------------------------
// ナーチャリング（メルマガ / MA）
//
// アポ獲得管理で「教育が必要」と判断したリードを購読者として送客し、
// メルマガ配信・開封/クリック計測・セグメント配信・ステップメールを回す。
// email が実体。sales_leads からの送客時は lead_id で元リードに紐づく。
// ---------------------------------------------------------------------------
export async function ensureNurturingTables(): Promise<void> {
  // 購読者
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nurturing_subscribers (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      company TEXT,
      name TEXT,
      status TEXT NOT NULL DEFAULT '購読中',
      source TEXT,
      lead_id INTEGER,
      industry TEXT,
      prefecture TEXT,
      owner TEXT,
      note TEXT,
      unsubscribe_token TEXT NOT NULL,
      subscribed_on DATE,
      unsubscribed_on DATE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // メールは実質ユニーク（重複送客を防ぐ）。大文字小文字を無視
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_nurturing_subscribers_email ON nurturing_subscribers (lower(email));');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_nurturing_subscribers_token ON nurturing_subscribers (unsubscribe_token);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_nurturing_subscribers_lead ON nurturing_subscribers (lead_id);');

  // リスト（セグメント）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nurturing_lists (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // リスト所属（静的メンバーシップ）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nurturing_list_members (
      list_id INTEGER NOT NULL,
      subscriber_id INTEGER NOT NULL,
      added_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (list_id, subscriber_id)
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_nurturing_list_members_sub ON nurturing_list_members (subscriber_id);');

  // キャンペーン（メルマガ）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nurturing_campaigns (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT,
      preheader TEXT,
      body_html TEXT,
      body_text TEXT,
      from_name TEXT,
      from_email TEXT,
      reply_to TEXT,
      list_id INTEGER,
      status TEXT NOT NULL DEFAULT '下書き',
      scheduled_at TIMESTAMPTZ,
      sent_started_at TIMESTAMPTZ,
      sent_finished_at TIMESTAMPTZ,
      total_count INTEGER NOT NULL DEFAULT 0,
      sent_count INTEGER NOT NULL DEFAULT 0,
      delivered_count INTEGER NOT NULL DEFAULT 0,
      opened_count INTEGER NOT NULL DEFAULT 0,
      clicked_count INTEGER NOT NULL DEFAULT 0,
      bounced_count INTEGER NOT NULL DEFAULT 0,
      unsubscribed_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // 配信明細（キャンペーン×購読者）。開封/クリックの計測もここ
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nurturing_campaign_recipients (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER NOT NULL,
      subscriber_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      sent_at TIMESTAMPTZ,
      first_opened_at TIMESTAMPTZ,
      open_count INTEGER NOT NULL DEFAULT 0,
      first_clicked_at TIMESTAMPTZ,
      click_count INTEGER NOT NULL DEFAULT 0,
      provider_message_id TEXT,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_nurturing_recipients_uniq ON nurturing_campaign_recipients (campaign_id, subscriber_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_nurturing_recipients_campaign ON nurturing_campaign_recipients (campaign_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_nurturing_recipients_msgid ON nurturing_campaign_recipients (provider_message_id);');

  // シナリオ（ステップメール）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nurturing_automations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      trigger TEXT,
      list_id INTEGER,
      status TEXT NOT NULL DEFAULT '停止',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nurturing_automation_steps (
      id SERIAL PRIMARY KEY,
      automation_id INTEGER NOT NULL,
      step_order INTEGER NOT NULL DEFAULT 1,
      delay_days INTEGER NOT NULL DEFAULT 0,
      subject TEXT,
      body_html TEXT,
      body_text TEXT
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_nurturing_automation_steps_auto ON nurturing_automation_steps (automation_id);');

  // シナリオ登録（購読者がどのシナリオの何ステップ目まで進んだか）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nurturing_automation_enrollments (
      id SERIAL PRIMARY KEY,
      automation_id INTEGER NOT NULL,
      subscriber_id INTEGER NOT NULL,
      current_step INTEGER NOT NULL DEFAULT 0,
      next_run_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT '進行中',
      enrolled_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_nurturing_enroll_uniq ON nurturing_automation_enrollments (automation_id, subscriber_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_nurturing_enroll_next ON nurturing_automation_enrollments (next_run_at);');
}

// ---------------------------------------------------------------------------
// 全テーブル一括作成
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// approach（アプローチリスト）
//
//   approach_industries(業界) ─> approach_lists(業界×都道府県, スプレッドシート1枚)
//     ─> approach_companies(シートの1行=会社。担当・手段・状況はここに持つ)
//     ─> approach_actions(状況を変えるたびに1行。営業別サマリーの元データ)
//
// 会社の情報はシートから取り込むが、担当・手段・状況はシステム側だけが持つ。
// 再取り込みで会社情報は上書きするが、対応の履歴は消さない（row_key で突き合わせる）。
// ---------------------------------------------------------------------------
export async function ensureApproachTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS approach_industries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS approach_lists (
      id TEXT PRIMARY KEY,
      industry_id TEXT NOT NULL REFERENCES approach_industries(id) ON DELETE CASCADE,
      prefecture TEXT NOT NULL,
      name TEXT,
      sheet_url TEXT NOT NULL,
      column_map JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_synced_at TIMESTAMPTZ,
      last_sync_error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_approach_lists_industry ON approach_lists (industry_id);');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS approach_companies (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL REFERENCES approach_lists(id) ON DELETE CASCADE,
      row_key TEXT NOT NULL,
      company_name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      website TEXT,
      linkedin TEXT,
      contact_name TEXT,
      sheet_note TEXT,
      raw JSONB NOT NULL DEFAULT '{}'::jsonb,
      assignee_id TEXT,
      channel TEXT NOT NULL DEFAULT '未対応',
      status TEXT NOT NULL DEFAULT '未対応',
      memo TEXT,
      last_action_at TIMESTAMPTZ,
      last_action_by TEXT,
      removed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (list_id, row_key)
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_approach_companies_list ON approach_companies (list_id);');
  // 2026-09-07: 「手段を1つ選んで状況を1つ」から「手段ごとに結果」へ。channel / status 列は使わない（残置）
  await pool.query(`ALTER TABLE approach_companies ADD COLUMN IF NOT EXISTS tel_status TEXT NOT NULL DEFAULT '未対応';`);
  await pool.query(`ALTER TABLE approach_companies ADD COLUMN IF NOT EXISTS dm_status TEXT NOT NULL DEFAULT '未送信';`);
  await pool.query(`ALTER TABLE approach_companies ADD COLUMN IF NOT EXISTS letter_status TEXT NOT NULL DEFAULT '未送付';`);
  // 2026-09-08: シート上の行番号（1始まり）。一覧の先頭に No. として出す。取り込みのたびに振り直す
  await pool.query(`ALTER TABLE approach_companies ADD COLUMN IF NOT EXISTS sheet_row INTEGER;`);
  // 既存行の穴埋め（取り込み順＝シート順なので created_at で採番）
  await pool.query(`
    UPDATE approach_companies c SET sheet_row = n.rn
    FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY list_id ORDER BY created_at, company_name) AS rn
      FROM approach_companies WHERE removed_at IS NULL
    ) n
    WHERE c.id = n.id AND c.sheet_row IS NULL;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS approach_actions (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES approach_companies(id) ON DELETE CASCADE,
      list_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      memo TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_approach_actions_actor ON approach_actions (actor_id, created_at);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_approach_actions_created ON approach_actions (created_at);');
}

export async function ensureAllTables(): Promise<void> {
  await ensureUsersTable();
  // members テーブルは igos_users へ統合済み（2026-09-02）。
  // 旧データは残してあるが、コードからは参照しない。
  await ensureAnnouncementsTable();
  await ensureAdminEventsTable();
  await ensureElearningVideosTable();
  await ensureElearningProgressTable();
  await ensureDocumentsTable();
  await ensureSalesLeadsTable();
  await ensureSalesDealsTable();
  await ensureSalesCustomersTable();
  await ensureAttendanceTables();
  await ensureNurturingTables();
  await ensureApproachTables();
}
