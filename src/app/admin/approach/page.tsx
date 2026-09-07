"use client";

// アプローチリスト（管理）（→ /admin/approach）。
//
// 業界の登録と、業界×都道府県ごとのスプレッドシートの登録をする。
// シートのURLを貼って「読み込む」と1行目の見出しが出るので、
// 会社名・電話番号などがどの列かを選んで登録する。登録と同時に取り込む。

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { INPUT, PAGE_MAIN, PAGE_INNER, PageHeader, PrimaryButton, SectionCard } from "@/components/panel";
import { TD, TH } from "@/components/table-ui";
import {
  COLUMN_FIELDS,
  PREFECTURES,
  type ApproachList,
  type ColumnMap,
  type Industry,
} from "@/lib/approach-types";
import { readJson, shortDateTime } from "@/app/approach/ui";

type Preview = { headers: string[]; sample: Record<string, string>[]; rowCount: number; guess: ColumnMap };

const EMPTY_FORM = {
  id: null as string | null,
  industryId: "",
  prefecture: "東京都" as string,
  name: "",
  sheetUrl: "",
  columnMap: {} as ColumnMap,
};

export default function AdminApproachPage() {
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [lists, setLists] = useState<ApproachList[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newIndustry, setNewIndustry] = useState("");
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyListId, setBusyListId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const json = await readJson<{ industries: Industry[]; lists: ApproachList[] }>(
        await fetch("/api/approach", { cache: "no-store" }),
      );
      setIndustries(json.industries ?? []);
      setLists(json.lists ?? []);
      setForm((f) => (f.industryId || !json.industries?.length ? f : { ...f, industryId: json.industries[0].id }));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (msg: string) => {
    setMessage(msg);
    setError(null);
  };
  const fail = (msg: string) => {
    setError(msg);
    setMessage(null);
  };

  // ---- 業界 ----------------------------------------------------------------

  const addIndustry = async () => {
    const name = newIndustry.trim();
    if (!name) return;
    const res = await fetch("/api/admin/approach/industries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const j = (await res.json()) as { ok: boolean; error?: string };
    if (!res.ok || !j.ok) return fail(j.error ?? "追加に失敗しました");
    setNewIndustry("");
    flash(`業界「${name}」を追加しました`);
    await load();
  };

  const renameIndustry = async (ind: Industry) => {
    const name = window.prompt("業界名", ind.name);
    if (name === null || !name.trim() || name.trim() === ind.name) return;
    const res = await fetch("/api/admin/approach/industries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ind.id, name: name.trim() }),
    });
    if (!res.ok) return fail("名前の変更に失敗しました");
    await load();
  };

  const moveIndustry = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= industries.length) return;
    const a = industries[index];
    const b = industries[target];
    await Promise.all([
      fetch("/api/admin/approach/industries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, sortOrder: target }),
      }),
      fetch("/api/admin/approach/industries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: b.id, sortOrder: index }),
      }),
    ]);
    await load();
  };

  const deleteIndustry = async (ind: Industry) => {
    const ok = window.confirm(
      `業界「${ind.name}」を削除しますか？\n配下のリスト ${ind.listCount} 件と会社 ${ind.companyCount} 社、対応履歴もすべて消えます。`,
    );
    if (!ok) return;
    const res = await fetch(`/api/admin/approach/industries?id=${encodeURIComponent(ind.id)}`, { method: "DELETE" });
    if (!res.ok) return fail("削除に失敗しました");
    flash(`業界「${ind.name}」を削除しました`);
    await load();
  };

  // ---- リスト ---------------------------------------------------------------

  const loadPreview = async () => {
    const url = form.sheetUrl.trim();
    if (!url) return fail("スプレッドシートのURLを貼ってください");
    setPreviewLoading(true);
    setError(null);
    try {
      const json = await readJson<Preview>(
        await fetch("/api/admin/approach/sheet-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sheetUrl: url }),
        }),
      );
      setPreview(json);
      // 編集中で既に対応付けがあればそれを優先し、無い項目だけ推測で埋める
      setForm((f) => ({ ...f, columnMap: { ...json.guess, ...f.columnMap } }));
    } catch (e) {
      setPreview(null);
      fail((e as Error).message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const startEdit = (l: ApproachList) => {
    setForm({
      id: l.id,
      industryId: l.industryId,
      prefecture: l.prefecture,
      name: l.name ?? "",
      sheetUrl: l.sheetUrl,
      columnMap: { ...l.columnMap },
    });
    setPreview(null);
    setMessage(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, industryId: industries[0]?.id ?? "" });
    setPreview(null);
  };

  const saveList = async () => {
    if (!form.industryId) return fail("業界を選んでください");
    if (!form.sheetUrl.trim()) return fail("スプレッドシートのURLを貼ってください");
    if (!form.columnMap.companyName) return fail("会社名の列を選んでください（先に「読み込む」を押してください）");
    setSaving(true);
    setError(null);
    try {
      const isEdit = !!form.id;
      const res = await fetch("/api/admin/approach/lists", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id ?? undefined,
          industryId: form.industryId,
          prefecture: form.prefecture,
          name: form.name,
          sheetUrl: form.sheetUrl.trim(),
          columnMap: form.columnMap,
          resync: true,
        }),
      });
      const j = (await res.json()) as {
        ok: boolean;
        error?: string;
        syncError?: string;
        result?: { inserted: number; updated: number; removed: number };
      };
      if (!res.ok || !j.ok) return fail(j.error ?? "保存に失敗しました");
      if (j.syncError) {
        fail(`登録しましたが取り込みに失敗しました: ${j.syncError}`);
      } else if (j.result) {
        flash(
          `${isEdit ? "更新" : "登録"}しました（追加 ${j.result.inserted} / 更新 ${j.result.updated} / 除外 ${j.result.removed}）`,
        );
      } else {
        flash(isEdit ? "更新しました" : "登録しました");
      }
      resetForm();
      await load();
    } finally {
      setSaving(false);
    }
  };

  const resyncList = async (l: ApproachList) => {
    setBusyListId(l.id);
    try {
      const json = await readJson<{ result: { inserted: number; updated: number; removed: number } }>(
        await fetch(`/api/approach/lists/${l.id}/sync`, { method: "POST" }),
      );
      flash(`${l.industryName} / ${l.prefecture} を取り込みました（追加 ${json.result.inserted} / 更新 ${json.result.updated} / 除外 ${json.result.removed}）`);
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setBusyListId(null);
      await load();
    }
  };

  const deleteList = async (l: ApproachList) => {
    const ok = window.confirm(
      `${l.industryName} / ${l.prefecture} のリストを削除しますか？\n会社 ${l.companyCount} 社と対応履歴も消えます。`,
    );
    if (!ok) return;
    const res = await fetch(`/api/admin/approach/lists?id=${encodeURIComponent(l.id)}`, { method: "DELETE" });
    if (!res.ok) return fail("削除に失敗しました");
    flash("リストを削除しました");
    await load();
  };

  const headersForSelect = useMemo(() => {
    const set = new Set<string>(preview?.headers ?? []);
    // 編集中でまだ読み込んでいなくても、保存済みの見出しは選択肢に出す
    Object.values(form.columnMap).forEach((h) => h && set.add(h));
    return [...set];
  }, [preview, form.columnMap]);

  return (
    <main className={PAGE_MAIN}>
      <div className={PAGE_INNER}>
        <PageHeader
          eyebrow="Admin"
          title="アプローチリスト（管理）"
          description="業界と、業界×都道府県ごとのスプレッドシートを登録します。シートは「リンクを知っている全員（閲覧者）」で共有してください。"
          action={
            <Link
              href="/approach"
              className="inline-flex items-center rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:border-[#9e8d70] hover:text-[#9e8d70] dark:border-neutral-700 dark:text-neutral-200"
            >
              アプローチリストを見る
            </Link>
          }
        />

        {message && (
          <div className="rounded-2xl border border-[#e5d9c0] bg-[#fdf7e7] px-5 py-3 text-sm text-[#7d6b4a]">{message}</div>
        )}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        <SectionCard title="業界" description="トップに並ぶ順です。矢印で並び替えできます">
          <div className="flex gap-2">
            <input
              value={newIndustry}
              onChange={(e) => setNewIndustry(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addIndustry();
              }}
              placeholder="例: 不動産販売"
              className={INPUT}
            />
            <PrimaryButton onClick={addIndustry} disabled={!newIndustry.trim()} className="shrink-0 whitespace-nowrap">
              追加
            </PrimaryButton>
          </div>
          {industries.length > 0 && (
            <ul className="mt-4 divide-y divide-neutral-100 dark:divide-neutral-800">
              {industries.map((ind, i) => (
                <li key={ind.id} className="flex items-center gap-3 py-2 text-sm">
                  <div className="flex gap-1">
                    <button
                      onClick={() => moveIndustry(i, -1)}
                      disabled={i === 0}
                      className="rounded px-1.5 text-neutral-400 hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-neutral-800"
                      aria-label="上へ"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveIndustry(i, 1)}
                      disabled={i === industries.length - 1}
                      className="rounded px-1.5 text-neutral-400 hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-neutral-800"
                      aria-label="下へ"
                    >
                      ↓
                    </button>
                  </div>
                  <span className="font-medium">{ind.name}</span>
                  <span className="text-xs text-neutral-400">
                    {ind.listCount} リスト / {ind.companyCount} 社
                  </span>
                  <div className="ml-auto flex gap-2 text-xs">
                    <button onClick={() => renameIndustry(ind)} className="text-neutral-500 hover:text-[#9e8d70]">
                      名前を変更
                    </button>
                    <button onClick={() => deleteIndustry(ind)} className="text-red-500 hover:text-red-700">
                      削除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={form.id ? "リストを編集" : "リストを登録"}
          description="1つの都道府県に1枚のスプレッドシート。URLを貼って「読み込む」→ 列を選ぶ → 登録"
          action={
            form.id && (
              <button onClick={resetForm} className="text-xs text-neutral-500 hover:text-[#9e8d70]">
                編集をやめて新規登録に戻る
              </button>
            )
          }
        >
          {industries.length === 0 ? (
            <p className="text-sm text-neutral-500">先に業界を追加してください。</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs text-neutral-500">
                  業界
                  <select
                    value={form.industryId}
                    onChange={(e) => setForm((f) => ({ ...f, industryId: e.target.value }))}
                    className={`${INPUT} mt-1`}
                  >
                    {industries.map((ind) => (
                      <option key={ind.id} value={ind.id}>
                        {ind.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-neutral-500">
                  都道府県
                  <select
                    value={form.prefecture}
                    onChange={(e) => setForm((f) => ({ ...f, prefecture: e.target.value }))}
                    className={`${INPUT} mt-1`}
                  >
                    {PREFECTURES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-neutral-500">
                  リスト名（任意）
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="例: 2026年9月 抽出分"
                    className={`${INPUT} mt-1`}
                  />
                </label>
              </div>

              <label className="block text-xs text-neutral-500">
                スプレッドシートのURL
                <div className="mt-1 flex gap-2">
                  <input
                    value={form.sheetUrl}
                    onChange={(e) => setForm((f) => ({ ...f, sheetUrl: e.target.value }))}
                    placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0"
                    className={INPUT}
                  />
                  <button
                    onClick={loadPreview}
                    disabled={previewLoading || !form.sheetUrl.trim()}
                    className="shrink-0 rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:border-[#9e8d70] hover:text-[#9e8d70] disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200"
                  >
                    {previewLoading ? "読み込み中…" : "読み込む"}
                  </button>
                </div>
                <span className="mt-1 block text-[11px] text-neutral-400">
                  タブが複数あるシートは、対象のタブを開いた状態のURL（gid付き）を貼ってください。
                </span>
              </label>

              {(preview || form.id) && (
                <div className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
                  <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                    列の対応付け
                    {preview && (
                      <span className="ml-2 font-normal text-neutral-400">
                        {preview.rowCount} 行 / 見出し: {preview.headers.join("、")}
                      </span>
                    )}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {COLUMN_FIELDS.map((field) => (
                      <label key={field.key} className="text-xs text-neutral-500">
                        {field.label}
                        {field.required && <span className="ml-1 text-red-500">*</span>}
                        <select
                          value={form.columnMap[field.key] ?? ""}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              columnMap: { ...f.columnMap, [field.key]: e.target.value || undefined },
                            }))
                          }
                          className={`${INPUT} mt-1`}
                        >
                          <option value="">（使わない）</option>
                          {headersForSelect.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  {preview && preview.sample.length > 0 && (
                    <div className="mt-4 overflow-x-auto">
                      <p className="mb-1 text-[11px] text-neutral-400">先頭3行のプレビュー</p>
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr>
                            {preview.headers.map((h) => (
                              <th key={h} className={`${TH} text-[10px]`}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                          {preview.sample.map((row, i) => (
                            <tr key={i}>
                              {preview.headers.map((h) => (
                                <td key={h} className={`${TD} max-w-[12rem] truncate text-xs`}>
                                  {row[h]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="mt-3 text-[11px] text-neutral-400">
                    対応付けしなかった列も取り込まれ、会社一覧の「詳細」で見られます。
                  </p>
                </div>
              )}

              <div className="flex justify-end">
                <PrimaryButton onClick={saveList} disabled={saving || !form.columnMap.companyName}>
                  {saving ? "保存中…" : form.id ? "更新して再取り込み" : "登録して取り込む"}
                </PrimaryButton>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="登録済みのリスト" description="取り込みは会社一覧の画面からも押せます" bodyClassName="p-0">
          {lists.length === 0 ? (
            <p className="px-5 py-6 text-sm text-neutral-500">まだリストがありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="border-b border-neutral-100 dark:border-neutral-800">
                  <tr>
                    <th className={TH}>業界</th>
                    <th className={TH}>都道府県</th>
                    <th className={TH}>リスト名</th>
                    <th className={`${TH} text-right`}>会社数</th>
                    <th className={`${TH} text-right`}>未対応</th>
                    <th className={TH}>最終取込</th>
                    <th className={TH}>シート</th>
                    <th className={TH}></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {lists.map((l) => (
                    <tr key={l.id}>
                      <td className={`${TD} font-medium`}>{l.industryName}</td>
                      <td className={TD}>{l.prefecture}</td>
                      <td className={`${TD} text-neutral-500`}>{l.name ?? ""}</td>
                      <td className={`${TD} text-right tabular-nums`}>{l.companyCount}</td>
                      <td className={`${TD} text-right tabular-nums`}>{l.untouchedCount}</td>
                      <td className={`${TD} text-xs`}>
                        {l.lastSyncedAt ? shortDateTime(l.lastSyncedAt) : <span className="text-neutral-400">未取込</span>}
                        {l.lastSyncError && (
                          <div className="max-w-[16rem] truncate text-red-500" title={l.lastSyncError}>
                            {l.lastSyncError}
                          </div>
                        )}
                      </td>
                      <td className={TD}>
                        <a
                          href={l.sheetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#7d6b4a] underline"
                        >
                          開く
                        </a>
                      </td>
                      <td className={TD}>
                        <div className="flex gap-2 text-xs">
                          <Link href={`/approach/list/${l.id}`} className="text-neutral-500 hover:text-[#9e8d70]">
                            一覧
                          </Link>
                          <button onClick={() => startEdit(l)} className="text-neutral-500 hover:text-[#9e8d70]">
                            編集
                          </button>
                          <button
                            onClick={() => resyncList(l)}
                            disabled={busyListId === l.id}
                            className="text-neutral-500 hover:text-[#9e8d70] disabled:opacity-50"
                          >
                            {busyListId === l.id ? "取込中…" : "再取込"}
                          </button>
                          <button onClick={() => deleteList(l)} className="text-red-500 hover:text-red-700">
                            削除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
