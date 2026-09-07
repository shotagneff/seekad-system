"use client";

// 会社一覧（→ /approach/list/[listId]）。業界×都道府県のスプレッドシート1枚ぶん。
//
// 営業がここで電話・DM・手紙をしながら、手段ごとの結果・担当・メモをその場で変える。
// テレアポ / DM / 手紙 は別々の欄。1社に対して複数の手段を使うので、
// 「手段を1つ選んで状況を1つ」にすると片方の結果が消える。
// 変えた瞬間に保存し、履歴（approach_actions）が残る。最後に動かした会社が上に来る。

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { PAGE_MAIN, PAGE_INNER, PageHeader, PrimaryButton } from "@/components/panel";
import {
  CELL_INPUT,
  FILL,
  FilterChip,
  Kpi,
  ROW_HOVER,
  TD,
  TH,
  TONE,
  TableFrame,
  ToneSelect,
  W,
} from "@/components/table-ui";
import {
  APPROACH_CHANNELS,
  CHANNEL_STATUSES,
  COLUMN_FIELDS,
  STATUS_TONE,
  hasAppointment,
  isUntouched,
  type ApproachChannel,
  type ApproachList,
  type ChannelStatuses,
  type Company,
} from "@/lib/approach-types";
import type { Member } from "@/lib/member";
import { Breadcrumb, Notice, SubNav, readJson, shortDateTime } from "../../ui";

type Filter = "全て" | "未対応" | "対応済み" | "アポ獲得";
const FILTERS: Filter[] = ["全て", "未対応", "対応済み", "アポ獲得"];

const CONTACT_LABEL = COLUMN_FIELDS.find((f) => f.key === "contactName")?.label ?? "代表取締役";

/** 手段の結果欄。「受付突破できず」が収まる最小幅に固定して、表の横幅を食わないようにする */
const CHANNEL_COL = "w-[7.25rem] min-w-[7.25rem] max-w-[7.25rem]";
/** 担当欄。姓名が見える最小幅 */
const OWNER_COL = "w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem]";

/** 行の塗り。アポ > 返信・突破 > その他 */
function rowFill(st: ChannelStatuses): string {
  if (hasAppointment(st)) return FILL.yellow;
  if (APPROACH_CHANNELS.some((ch) => st[ch] === "返信あり")) return FILL.violet;
  if (st.テレアポ === "突破・アポ不可") return FILL.orange;
  return FILL.none;
}

export default function ListPage() {
  const params = useParams<{ listId: string }>();
  const listId = params?.listId ?? "";

  const [list, setList] = useState<ApproachList | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [filter, setFilter] = useState<Filter>("全て");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [memoDraft, setMemoDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!listId) return;
    setError(null);
    try {
      const json = await readJson<{ list: ApproachList; companies: Company[] }>(
        await fetch(`/api/approach/lists/${listId}`, { cache: "no-store" }),
      );
      setList(json.list);
      setCompanies(json.companies ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [listId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const loadMembers = async () => {
      try {
        const res = await fetch("/api/members", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Member[];
        setMembers(Array.isArray(data) ? data : []);
      } catch {
        setMembers([]);
      }
    };
    void loadMembers();
  }, []);

  const memberName = useCallback(
    (id: string | null) => {
      if (!id) return null;
      return members.find((m) => m.id === id)?.name ?? id;
    },
    [members],
  );

  /** 1件を更新。画面は先に書き換え、失敗したら元に戻す */
  const patch = useCallback(
    async (
      id: string,
      body: { assigneeId?: string | null; statuses?: Partial<ChannelStatuses>; memo?: string | null },
    ) => {
      const before = companies;
      const now = new Date().toISOString();
      setCompanies((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          const statuses = { ...c.statuses, ...(body.statuses ?? {}) };
          const actionHappened = APPROACH_CHANNELS.some((ch) => statuses[ch] !== c.statuses[ch]);
          const assigneeId = body.assigneeId === undefined ? c.assigneeId : body.assigneeId;
          return {
            ...c,
            assigneeId,
            assigneeName: memberName(assigneeId),
            statuses,
            memo: body.memo === undefined ? c.memo : body.memo,
            lastActionAt: actionHappened ? now : c.lastActionAt,
          };
        }),
      );
      try {
        const res = await fetch(`/api/approach/companies/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? "保存に失敗しました");
        }
        // 「最後に動かした人」や並び順はサーバが決めるので読み直す
        void load();
      } catch (e) {
        setCompanies(before);
        setError((e as Error).message);
      }
    },
    [companies, load, memberName],
  );

  const sync = async () => {
    if (!listId) return;
    setSyncing(true);
    setNotice(null);
    setError(null);
    try {
      const json = await readJson<{ result: { inserted: number; updated: number; removed: number } }>(
        await fetch(`/api/approach/lists/${listId}/sync`, { method: "POST" }),
      );
      const r = json.result;
      setNotice(`シートを取り込みました（追加 ${r.inserted} / 更新 ${r.updated} / 除外 ${r.removed}）`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((c) => {
      const untouched = isUntouched(c.statuses);
      if (filter === "未対応" && !untouched) return false;
      if (filter === "対応済み" && untouched) return false;
      if (filter === "アポ獲得" && !hasAppointment(c.statuses)) return false;
      if (assigneeFilter && c.assigneeId !== assigneeFilter) return false;
      if (q) {
        const hay = [c.companyName, c.phone, c.address, c.contactName, c.memo, c.sheetNote]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [companies, filter, assigneeFilter, query]);

  const counts = useMemo(() => {
    const untouched = companies.filter((c) => isUntouched(c.statuses)).length;
    const appointments = companies.filter((c) => hasAppointment(c.statuses)).length;
    const byChannel = Object.fromEntries(
      APPROACH_CHANNELS.map((ch) => [
        ch,
        companies.filter((c) => c.statuses[ch] !== CHANNEL_STATUSES[ch][0]).length,
      ]),
    ) as Record<ApproachChannel, number>;
    return { total: companies.length, untouched, done: companies.length - untouched, appointments, byChannel };
  }, [companies]);

  /** 対応付けした列以外のシートの値。詳細行に出す */
  const extraEntries = (c: Company) => {
    const mapped = new Set(Object.values(list?.columnMap ?? {}));
    return Object.entries(c.raw ?? {}).filter(([k, v]) => !mapped.has(k) && v);
  };

  const title = list ? `${list.industryName} / ${list.prefecture}` : "アプローチリスト";
  const colCount = 11;

  return (
    <main className={PAGE_MAIN}>
      <div className={PAGE_INNER}>
        <PageHeader
          eyebrow="Approach List"
          title={title}
          description={list?.name ?? "テレアポ・DM・手紙それぞれの結果を変えるとその場で保存され、営業別サマリーに反映されます。"}
          action={
            list && (
              <div className="flex flex-wrap gap-2">
                <a
                  href={list.sheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:border-[#9e8d70] hover:text-[#9e8d70] dark:border-neutral-700 dark:text-neutral-200"
                >
                  元のシートを開く
                </a>
                <PrimaryButton onClick={sync} disabled={syncing}>
                  {syncing ? "取り込み中…" : "シートから再取り込み"}
                </PrimaryButton>
              </div>
            )
          }
        />
        <SubNav />
        <Breadcrumb
          items={[
            { href: "/approach", label: "業界" },
            { href: list ? `/approach/${list.industryId}` : undefined, label: list?.industryName ?? "…" },
            { label: list?.prefecture ?? "…" },
          ]}
        />

        {loading && <Notice>読み込み中…</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        {notice && <Notice>{notice}</Notice>}
        {list?.lastSyncError && !error && (
          <Notice tone="error">前回の取り込みに失敗しています: {list.lastSyncError}</Notice>
        )}

        {list && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Kpi
                label="会社数"
                value={String(counts.total)}
                hint={list.lastSyncedAt ? `取込 ${shortDateTime(list.lastSyncedAt)}` : "未取込"}
              />
              <Kpi label="未対応" value={String(counts.untouched)} hint="どの手段もまだ" />
              <Kpi label="テレアポ済" value={String(counts.byChannel.テレアポ)} hint="コールした会社" />
              <Kpi
                label="DM・手紙済"
                value={String(counts.byChannel.DM + counts.byChannel.手紙)}
                hint={`DM ${counts.byChannel.DM} / 手紙 ${counts.byChannel.手紙}`}
              />
              <Kpi
                label="アポ獲得"
                value={String(counts.appointments)}
                hint={counts.total ? `${Math.round((counts.appointments / counts.total) * 1000) / 10}%` : "–"}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {FILTERS.map((f) => (
                <FilterChip key={f} label={f} active={filter === f} onClick={() => setFilter(f)} />
              ))}
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600 outline-none dark:bg-neutral-800 dark:text-neutral-300"
              >
                <option value="">担当: 全員</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    担当: {m.name}
                  </option>
                ))}
              </select>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="会社名・電話・住所・メモで検索"
                className="ml-auto w-full max-w-xs rounded-full border border-neutral-200 bg-white px-4 py-1.5 text-xs outline-none focus:border-[#9e8d70] dark:border-neutral-700 dark:bg-neutral-900"
              />
              <span className="text-xs text-neutral-400">{filtered.length} 件</span>
            </div>

            <TableFrame>
              <table className="min-w-full">
                <thead className="border-b border-neutral-100 dark:border-neutral-800">
                  <tr>
                    {APPROACH_CHANNELS.map((ch) => (
                      <th key={ch} className={`${TH} ${CHANNEL_COL}`}>
                        {ch}
                      </th>
                    ))}
                    <th className={`${TH} ${OWNER_COL}`}>担当</th>
                    <th className={`${TH} min-w-[14rem]`}>会社名</th>
                    <th className={`${TH} min-w-[7rem]`}>{CONTACT_LABEL}</th>
                    <th className={`${TH} ${W.phone}`}>電話番号</th>
                    <th className={`${TH} min-w-[16rem]`}>住所</th>
                    <th className={`${TH} min-w-[14rem]`}>メモ</th>
                    <th className={`${TH} ${W.date}`}>最終更新</th>
                    <th className={TH}></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={colCount + 1} className="px-5 py-8 text-center text-sm text-neutral-500">
                        {companies.length === 0
                          ? "会社がまだありません。「シートから再取り込み」を押してください。"
                          : "条件に合う会社がありません。"}
                      </td>
                    </tr>
                  )}
                  {filtered.map((c) => {
                    const extras = extraEntries(c);
                    const isOpen = openId === c.id;
                    const untouched = isUntouched(c.statuses);
                    return (
                      <React.Fragment key={c.id}>
                        <tr className={`${rowFill(c.statuses)} ${ROW_HOVER}`}>
                          {APPROACH_CHANNELS.map((ch, i) => (
                            <td key={ch} className={`${TD} ${CHANNEL_COL} ${i === 0 ? "pl-2" : "px-1.5"}`}>
                              <div className="flex items-center gap-1">
                                {i === 0 &&
                                  (untouched ? (
                                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" title="未対応" />
                                  ) : (
                                    <span className="h-1.5 w-1.5 shrink-0" />
                                  ))}
                                <ToneSelect
                                  value={c.statuses[ch]}
                                  options={CHANNEL_STATUSES[ch]}
                                  tone={TONE[STATUS_TONE[c.statuses[ch]] ?? "gray"]}
                                  onChange={(v) => void patch(c.id, { statuses: { [ch]: v } as Partial<ChannelStatuses> })}
                                />
                              </div>
                            </td>
                          ))}
                          <td className={`${TD} ${OWNER_COL} px-1.5`}>
                            <select
                              value={c.assigneeId ?? ""}
                              onChange={(e) => void patch(c.id, { assigneeId: e.target.value || null })}
                              className={CELL_INPUT}
                            >
                              <option value="">未設定</option>
                              {members.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                              {c.assigneeId && !members.some((m) => m.id === c.assigneeId) && (
                                <option value={c.assigneeId}>{c.assigneeName ?? c.assigneeId}</option>
                              )}
                            </select>
                          </td>
                          <td className={`${TD} font-medium`}>
                            <span className="whitespace-normal">{c.companyName}</span>
                          </td>
                          <td className={`${TD} text-neutral-600 dark:text-neutral-300`}>
                            {c.contactName ?? <span className="text-neutral-300">–</span>}
                          </td>
                          <td className={TD}>
                            {c.phone ? (
                              <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="tabular-nums hover:text-[#9e8d70]">
                                {c.phone}
                              </a>
                            ) : (
                              <span className="text-neutral-300">–</span>
                            )}
                          </td>
                          <td className={`${TD} max-w-[20rem] truncate text-neutral-600 dark:text-neutral-300`} title={c.address ?? ""}>
                            {c.address ?? <span className="text-neutral-300">–</span>}
                          </td>
                          <td className={TD}>
                            <input
                              value={memoDraft[c.id] ?? c.memo ?? ""}
                              onChange={(e) => setMemoDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                              onBlur={() => {
                                const v = memoDraft[c.id];
                                if (v === undefined || v === (c.memo ?? "")) return;
                                void patch(c.id, { memo: v });
                                setMemoDraft((d) => {
                                  const next = { ...d };
                                  delete next[c.id];
                                  return next;
                                });
                              }}
                              placeholder="メモ"
                              className={CELL_INPUT}
                            />
                          </td>
                          <td className={`${TD} text-xs text-neutral-500`}>
                            {c.lastActionAt ? (
                              <>
                                <div>{shortDateTime(c.lastActionAt)}</div>
                                <div className="text-neutral-400">{c.lastActionByName ?? ""}</div>
                              </>
                            ) : (
                              <span className="text-neutral-300">–</span>
                            )}
                          </td>
                          <td className={TD}>
                            {(extras.length > 0 || c.sheetNote) && (
                              <button
                                onClick={() => setOpenId(isOpen ? null : c.id)}
                                className="rounded-full px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                              >
                                {isOpen ? "閉じる" : "詳細"}
                              </button>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-neutral-50/70 dark:bg-neutral-900/60">
                            <td colSpan={colCount + 1} className="px-5 py-3">
                              <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
                                {c.sheetNote && (
                                  <div>
                                    <dt className="text-neutral-400">
                                      {COLUMN_FIELDS.find((f) => f.key === "sheetNote")?.label}
                                    </dt>
                                    <dd className="whitespace-pre-wrap text-neutral-700 dark:text-neutral-200">{c.sheetNote}</dd>
                                  </div>
                                )}
                                {extras.map(([k, v]) => (
                                  <div key={k}>
                                    <dt className="text-neutral-400">{k}</dt>
                                    <dd className="whitespace-pre-wrap break-all text-neutral-700 dark:text-neutral-200">{v}</dd>
                                  </div>
                                ))}
                              </dl>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </TableFrame>
          </>
        )}
      </div>
    </main>
  );
}
