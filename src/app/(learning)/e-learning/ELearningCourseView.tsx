"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PAGE_MAIN, PAGE_INNER, PANEL, PageHeader, SectionCard, Panel } from "@/components/panel";

// 元 learning-portal と同じ構造のダミーデータ（必要に応じて編集してください）
const LOGIN_PASSWORD = "seekad_learning"; // いまは未使用（パスワード画面なし運用）

const STORAGE_KEY_WATCHED = "learning_portal_watched_videos";
const STORAGE_KEY_SECTION2_CHECKLIST = "intern_growth_os_section2_checklist";
const STORAGE_KEY_SECTION3_CHECKLIST = "intern_growth_os_section3_checklist";
const MAIN_COLOR = "#9e8d70";

function parseEpisodeNumber(label?: string | null): number | null {
  if (!label) return null;
  const match = label.match(/第(\d+)回/);
  if (!match) return null;
  const num = Number(match[1]);
  return Number.isNaN(num) ? null : num;
}

type Video = {
  id: string;
  title: string;
  category: string;
  url: string;
  description: string;
  course?: string;
  sectionId?: number;
  subSection?: string;
  episodeLabel?: string;
  updatedAt?: string;
  durationMinutes?: number;
  instructorKey?: keyof typeof INSTRUCTORS;
  instructorId?: string;
  instructorName?: string;
  instructorTitle?: string;
  coverImageUrl?: string;
  instructorAvatarUrl?: string;
  materials?: { label: string; url: string }[];
};

type AdminVideoFromApi = {
  id: string;
  title: string;
  category?: string | null;
  url: string;
  course?: string | null;
  coverImageUrl?: string | null;
  sectionId?: number | null;
  episodeLabel?: string | null;
  durationMinutes?: number | null;
  instructorId?: string | null;
  instructorName?: string | null;
  materialLabel?: string | null;
  materialUrl?: string | null;
  updatedAt?: string | null;
};

type Member = {
  id: string;
  name: string;
  team?: string;
  role?: string;
  iconUrl?: string;
  active: boolean;
};

const INSTRUCTORS = {
  hiraga: {
    name: "平賀 翔大",
    title: "代表取締役",
    avatar: "/images/avatars/avatar_hiraga.jpg",
  },
  takuma: {
    name: "宅間 宗太",
    title: "マネージャー",
    avatar: "/images/avatars/avatar_takuma.jpg",
  },
  sato: {
    name: "佐藤 翔永",
    title: "マネージャー",
    avatar: "/images/avatars/avatar_sato.jpg",
  },
} as const;

function inferInstructorKey(name?: string | null): keyof typeof INSTRUCTORS | undefined {
  if (!name) return undefined;
  if (name.includes("平賀")) return "hiraga";
  if (name.includes("宅間")) return "takuma";
  if (name.includes("佐藤")) return "sato";
  return undefined;
}

const VIDEOS: Video[] = [
  {
    id: "sec1-001",
    title: "ラーニングハブの全体像と使い方",
    category: "スタートガイド",
    url: "https://example.com/sec1-001",
    description:
      "シークアドラーニングハブの目的と全体構造、学び方の流れを説明します。",
    sectionId: 1,
    episodeLabel: "第1回",
    updatedAt: "2025-04-01",
    durationMinutes: 10,
    instructorName: "平賀 翔大",
    instructorTitle: "代表取締役",
    coverImageUrl: "/cover/cover_mkt01.png",
    instructorAvatarUrl: "/images/avatars/avatar_hiraga.jpg",
    materials: [
      {
        label: "スライド資料（PDF）",
        url: "https://example.com/materials/sec1-001.pdf",
      },
    ],
  },
  {
    id: "sec1-002",
    title: "SEEKADメンバー概要と期待役割",
    category: "スタートガイド",
    url: "https://example.com/sec1-002",
    description:
      "SEEKADの全体像と、シークアドメンバーに期待する役割・スタンスを解説します。",
    sectionId: 1,
    episodeLabel: "第2回",
    updatedAt: "2025-04-02",
    durationMinutes: 12,
    instructorKey: "takuma",
    materials: [
      {
        label: "メンバー概要サマリー（PDF）",
        url: "https://example.com/materials/sec1-002.pdf",
      },
    ],
  },
  {
    id: "sec1-003",
    title: "1ヶ月／3ヶ月成長ロードマップ",
    category: "スタートガイド",
    url: "https://example.com/sec1-003",
    description:
      "入社から1ヶ月・3ヶ月で到達してほしい状態をロードマップ形式で整理します。",
    sectionId: 1,
    episodeLabel: "第3回",
    updatedAt: "2025-04-03",
    durationMinutes: 15,
    instructorName: "教育担当",
    instructorTitle: "プログラム責任者",
  },
  {
    id: "sec2-001",
    title: "Gmail / Slack / Notion / Zoom 初期設定ガイド",
    category: "初期設定",
    url: "https://example.com/sec2-001",
    description:
      "入社前に必ず行う、主要ツールのアカウント設定と基本操作を解説します。",
    sectionId: 2,
    subSection: "A. ツール初期設定",
    episodeLabel: "第1回",
    updatedAt: "2025-04-04",
    durationMinutes: 20,
    instructorName: "情シス担当",
    instructorTitle: "システム管理",
  },
  // 必要に応じて script.js の残りも追記できます
];

type SectionInfo = { title: string; description: string };

type Props = {
  courseId: string;        // "onboarding" | "sales" | "ai" | "callforce"
  courseTitle: string;     // "入社直後研修" | "法人営業研修" | "AI研修" | "コールフォース（商談記録）"
  courseSubtitle: string;  // 説明文
  showCourseNav?: boolean; // コース選択ナビを表示するか（デフォルトtrue）
  // コース固有のセクション定義（sectionId → タイトル・説明）。
  // 指定すると getSectionInfo より優先され、動画が無いセクションも見出しを表示する。
  sections?: Record<number, SectionInfo>;
  // false にするとセクションのロック（チェックリスト未完了で非表示）を無効化する。デフォルト true。
  lockSections?: boolean;
};

/** ユーザー管理の「AI研修解禁」が必要なコース */
const AI_COURSE_ID = "ai";

const courses = [
  { id: "onboarding", title: "入社直後研修", subtitle: "基礎を学ぶ", icon: "📚", href: "/e-learning" },
  { id: "sales", title: "法人営業研修", subtitle: "営業スキルを磨く", icon: "💼", href: "/e-learning/sales-training" },
  { id: "ai", title: "AI研修", subtitle: "AI活用を学ぶ", icon: "🤖", href: "/e-learning/ai-training" },
  { id: "callforce", title: "コールフォース（商談記録）", subtitle: "商談動画アーカイブ", icon: "📞", href: "/e-learning/callforce" },
];

export function ELearningCourseView({ courseId, courseTitle, courseSubtitle, showCourseNav = true, sections, lockSections = true }: Props) {
  const router = useRouter();
  const [videos, setVideos] = useState<Video[]>([]);
  const [membersById, setMembersById] = useState<Map<string, Member>>(new Map());
  const [watchedSet, setWatchedSet] = useState<Set<string>>(new Set());
  const [achievementToast, setAchievementToast] = useState<string | null>(null);
  // AI研修を見られるか。null = 確認中。管理者と「AI研修解禁」にチェックのある人だけ true
  const [aiUnlocked, setAiUnlocked] = useState<boolean | null>(null);
  const aiLocked = courseId === AI_COURSE_ID && aiUnlocked === false;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = res.ok ? ((await res.json()) as { aiTrainingUnlocked?: boolean }) : null;
        if (!cancelled) setAiUnlocked(data?.aiTrainingUnlocked === true);
      } catch {
        if (!cancelled) setAiUnlocked(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const [highlightVideoId, setHighlightVideoId] = useState<string | null>(null);
  const [section2Checklist, setSection2Checklist] = useState({
    googleFormSubmitted: false,
    contractSigned: false,
    lineGroupPosted: false,
    proKinLoggedIn: false,
  });
  const [section3Checklist, setSection3Checklist] = useState({
    asanaAccessible: false,
    asanaRecurringTaskSet: false,
  });

  const totalVideoCount = useMemo(() => videos.length, [videos]);
  const totalWatchedCount = useMemo(
    () => videos.filter((v) => watchedSet.has(v.id)).length,
    [videos, watchedSet]
  );


  const isOnboardingComplete = totalVideoCount > 0 && totalVideoCount === totalWatchedCount;
  // localStorage から視聴済み情報を復元
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_WATCHED);
      if (!raw) return;
      const arr = JSON.parse(raw) as string[];
      if (Array.isArray(arr)) {
        setWatchedSet(new Set(arr));
      }
    } catch (e) {
      console.error("failed to load watched videos", e);
    }
  }, []);

  // DB から視聴済み情報を復元（ログインユーザー単位で共有）
  useEffect(() => {
    const loadFromServer = async () => {
      try {
        const res = await fetch("/api/e-learning/progress", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { watchedVideoIds?: string[] };
        const ids = Array.isArray(data?.watchedVideoIds) ? data.watchedVideoIds : [];
        if (ids.length > 0) {
          setWatchedSet(new Set(ids));
        }
      } catch (e) {
        console.error("failed to load watched progress", e);
      }
    };

    void loadFromServer();
  }, []);

  // localStorage からセクション3チェックリストを復元
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_SECTION3_CHECKLIST);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<typeof section3Checklist>;
      setSection3Checklist((prev) => ({
        ...prev,
        ...parsed,
      }));
    } catch (e) {
      console.error("failed to load section3 checklist", e);
    }
  }, []);

  // localStorage からセクション2チェックリストを復元
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_SECTION2_CHECKLIST);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<typeof section2Checklist>;
      setSection2Checklist((prev) => ({
        ...prev,
        ...parsed,
      }));
    } catch (e) {
      console.error("failed to load section2 checklist", e);
    }
  }, []);

  // 視聴済みセットの更新を localStorage に保存
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const arr = Array.from(watchedSet);
      window.localStorage.setItem(STORAGE_KEY_WATCHED, JSON.stringify(arr));
    } catch (e) {
      console.error("failed to save watched videos", e);
    }
  }, [watchedSet]);

  // セクション2チェックリストの更新を localStorage に保存
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY_SECTION2_CHECKLIST,
        JSON.stringify(section2Checklist)
      );
    } catch (e) {
      console.error("failed to save section2 checklist", e);
    }
  }, [section2Checklist]);

  // セクション3チェックリストの更新を localStorage に保存
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY_SECTION3_CHECKLIST,
        JSON.stringify(section3Checklist)
      );
    } catch (e) {
      console.error("failed to save section3 checklist", e);
    }
  }, [section3Checklist]);

  // 初回マウント時に DB(API) から最新の一覧を取得
  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const res = await fetch("/api/e-learning/videos");
        if (!res.ok) return;
        const data = (await res.json()) as AdminVideoFromApi[];
        if (!Array.isArray(data)) return;

        const mapped: Video[] = data.map((v) => {
          const member = v.instructorId ? membersById.get(v.instructorId) : undefined;
          const resolvedInstructorName = v.instructorId
            ? member?.name || v.instructorName
            : v.instructorName;
          const instructorKey = inferInstructorKey(resolvedInstructorName);
          const updatedAtDate =
            typeof v.updatedAt === "string" && v.updatedAt.length >= 10
              ? v.updatedAt.slice(0, 10)
              : undefined;

          return {
            id: v.id,
            title: v.title,
            category: v.category ?? "その他",
            url: v.url,
            description: "",
            course: v.course ?? undefined,
            sectionId: v.sectionId ?? undefined,
            episodeLabel: v.episodeLabel ?? undefined,
            updatedAt: updatedAtDate,
            durationMinutes:
              typeof v.durationMinutes === "number" && v.durationMinutes > 0
                ? v.durationMinutes
                : undefined,
            instructorKey,
            instructorId: v.instructorId ?? undefined,
            instructorName: resolvedInstructorName ?? undefined,
            instructorTitle: member?.role || member?.team || undefined,
            coverImageUrl: v.coverImageUrl ?? undefined,
            instructorAvatarUrl: member?.iconUrl || undefined,
            materials:
              v.materialLabel || v.materialUrl
                ? [
                    {
                      label: v.materialLabel ?? v.materialUrl ?? "",
                      url: v.materialUrl ?? "",
                    },
                  ]
                : [],
          };
        });

        if (mapped.length > 0) {
          setVideos(mapped);
        }
      } catch (e) {
        console.error("failed to fetch e-learning videos", e);
      }
    };

    void fetchVideos();
  }, [membersById]);

  // 講師（メンバー）情報を取得
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const res = await fetch("/api/members", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Member[];
        if (!Array.isArray(data)) return;
        const map = new Map<string, Member>();
        data.forEach((m) => map.set(m.id, m));
        setMembersById(map);
      } catch (e) {
        console.error("failed to fetch members", e);
      }
    };

    void fetchMembers();
  }, []);

  const filteredVideos = useMemo(() => videos.filter((v) => v.course === courseId), [videos, courseId]);

  const toggleWatched = (id: string) => {
    setWatchedSet((prev) => {
      const next = new Set(prev);
      const willBeWatched = !next.has(id);
      if (willBeWatched) {
        next.add(id);
        setHighlightVideoId(id);
        setAchievementToast("視聴済みにしました！おつかれさまです");
      } else {
        next.delete(id);
      }

      void fetch("/api/e-learning/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: id, watched: willBeWatched }),
      }).catch(() => {
        // ignore (localStorage fallback)
      });

      return next;
    });
  };

  // 達成感の演出（カードのハイライト）を一定時間で解除
  useEffect(() => {
    if (!highlightVideoId) return;
    const t = window.setTimeout(() => setHighlightVideoId(null), 800);
    return () => window.clearTimeout(t);
  }, [highlightVideoId]);

  // トーストを一定時間で消す
  useEffect(() => {
    if (!achievementToast) return;
    const t = window.setTimeout(() => setAchievementToast(null), 1800);
    return () => window.clearTimeout(t);
  }, [achievementToast]);

  const section2Videos = useMemo(
    () => videos.filter((v) => v.sectionId === 2),
    [videos]
  );
  const isSection2WatchedAll = useMemo(() => {
    if (section2Videos.length === 0) return false;
    return section2Videos.every((v) => watchedSet.has(v.id));
  }, [section2Videos, watchedSet]);
  const isSection2ChecklistAll = useMemo(() => {
    return (
      section2Checklist.googleFormSubmitted &&
      section2Checklist.contractSigned &&
      section2Checklist.lineGroupPosted &&
      section2Checklist.proKinLoggedIn
    );
  }, [section2Checklist]);
  const isSection2Completed = useMemo(() => {
    return isSection2WatchedAll && isSection2ChecklistAll;
  }, [isSection2WatchedAll, isSection2ChecklistAll]);

  const section3Videos = useMemo(
    () => videos.filter((v) => v.sectionId === 3),
    [videos]
  );
  const isSection3WatchedAll = useMemo(() => {
    if (section3Videos.length === 0) return false;
    return section3Videos.every((v) => watchedSet.has(v.id));
  }, [section3Videos, watchedSet]);
  const isSection3ChecklistAll = useMemo(() => {
    return section3Checklist.asanaAccessible && section3Checklist.asanaRecurringTaskSet;
  }, [section3Checklist]);
  const isSection3Completed = useMemo(() => {
    return isSection3WatchedAll && isSection3ChecklistAll;
  }, [isSection3WatchedAll, isSection3ChecklistAll]);

  const isSectionUnlocked = (sectionId: number) => {
    if (lockSections === false) return true;
    if (sectionId <= 2) return true;
    if (sectionId === 3) return isSection2Completed;
    return isSection2Completed && isSection3Completed;
  };

  const openVideo = (video: Video) => {
    const sectionId = video.sectionId ?? 0;
    if (sectionId > 2 && !isSectionUnlocked(sectionId)) {
      if (sectionId === 3) {
        alert(
          "セクション2のチェックリストと動画視聴を完了すると、セクション3が解放されます。"
        );
      } else {
        alert(
          "セクション2・セクション3のチェックリストと動画視聴を完了すると、このセクションが解放されます。"
        );
      }
      return;
    }
    // sec1-*** などアプリ内の詳細ページが用意されている動画は、内部遷移させる
    if (video.id.startsWith("sec")) {
      router.push(`/videos/${video.id}`);
      setWatchedSet((prev) => new Set(prev).add(video.id));
      void fetch("/api/e-learning/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: video.id, watched: true }),
      }).catch(() => {
        // ignore
      });
      return;
    }

    // それ以外は従来どおり外部URLを新規タブで開く
    if (typeof window !== "undefined") {
      window.open(video.url, "_blank");
      setWatchedSet((prev) => new Set(prev).add(video.id));
      void fetch("/api/e-learning/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: video.id, watched: true }),
      }).catch(() => {
        // ignore
      });
    }
  };

  // sectionId ごとに並べる。
  // - カリキュラム型コース（onboarding / sales / ai）: 「第◯回」の数字が小さいものが左。
  //   番号が無い場合は新しいもの（updatedAt 降順）が左に来るようにする。
  // - 商談記録（callforce）は事例集なので、常に新しいものを左に並べる。
  const newestFirstCourse = courseId === "callforce";
  const sorted = useMemo(() => {
    return [...filteredVideos].sort((a, b) => {
      const sa = a.sectionId ?? 0;
      const sb = b.sectionId ?? 0;
      if (sa !== sb) return sa - sb;

      const ea = parseEpisodeNumber(a.episodeLabel);
      const eb = parseEpisodeNumber(b.episodeLabel);
      const da = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const db = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;

      if (newestFirstCourse) {
        if (da !== db) return db - da; // 新しいものが左
        if (ea !== null && eb !== null && ea !== eb) return eb - ea;
        return (a.title || "").localeCompare(b.title || "");
      }

      if (ea !== null && eb !== null && ea !== eb) {
        return ea - eb; // 第1回, 第2回, ... の順に並べる
      }

      if (da !== db) return db - da; // 新しいものが左、古いものが右

      return (a.title || "").localeCompare(b.title || "");
    });
  }, [filteredVideos, newestFirstCourse]);

  const groupedBySection = useMemo(() => {
    const map = new Map<number, Video[]>();
    sorted.forEach((video) => {
      const id = video.sectionId ?? 0;
      const bucket = map.get(id) ?? [];
      bucket.push(video);
      map.set(id, bucket);
    });
    return map;
  }, [sorted]);

  // sections（コース固有定義）がある場合は、動画が無いセクションも含めて
  // 定義順に見出しを表示する。無い場合は従来どおり動画のあるセクションのみ。
  const sectionIdsToRender = useMemo(() => {
    if (sections) {
      return Object.keys(sections)
        .map((k) => Number(k))
        .sort((a, b) => a - b);
    }
    return [...groupedBySection.keys()];
  }, [sections, groupedBySection]);

  const getSectionInfo = (sectionId: number): SectionInfo => {
    if (sections && sections[sectionId]) return sections[sectionId];
    if (sectionId === 1)
      return {
        title: "セクション1：はじめに（スタートガイド）",
        description:
          "全体像と、このラーニングハブの使い方を理解するための導入セクションです。",
      };
    if (sectionId === 2)
      return {
        title: "セクション2：初期設定・アカウント準備",
        description:
          "業務で使う主要ツールの初期設定や、コミュニケーションの基本ルールを押さえます。",
      };
    if (sectionId === 3)
      return {
        title: "セクション3：日々の業務のポイント",
        description: "日々の業務におけるポイントや気を付けるべき点を解説します",
      };
    return { title: "その他", description: "" };
  };

  return (
    <main className={PAGE_MAIN}>
      <div className={PAGE_INNER}>
        {achievementToast && (
          <div className="fixed bottom-5 right-5 z-50">
            <div className="flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 text-[12px] font-semibold text-white shadow-lg">
              <span aria-hidden>✅</span>
              <span>{achievementToast}</span>
            </div>
          </div>
        )}

        <PageHeader
          eyebrow="Learning Hub"
          title={courseTitle}
          description={courseSubtitle}
          icon={
            <Image
              src="/images/icons/elearning-icon.png"
              alt="動画研修ラーニングアイコン"
              width={36}
              height={36}
              className="h-full w-full object-cover"
            />
          }
        />

        {/* コース選択 */}
        {showCourseNav && (
          <nav className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {courses.map((c) => {
              const locked = c.id === AI_COURSE_ID && aiUnlocked === false;
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    if (!locked) router.push(c.href);
                  }}
                  title={locked ? "AI研修は未解禁です。管理者にユーザー管理の「AI研修解禁」を依頼してください" : undefined}
                  className={`rounded-2xl border px-4 py-3 shadow-sm transition ${
                    locked
                      ? "cursor-not-allowed border-dashed border-neutral-200 bg-neutral-50 opacity-60 dark:border-neutral-800 dark:bg-neutral-900/40"
                      : c.id === courseId
                        ? "cursor-pointer border-[#9e8d70] bg-[#9e8d70]/5 hover:shadow-md"
                        : "cursor-pointer border-neutral-200 bg-white/90 hover:border-[#9e8d70] hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900/80"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{locked ? "🔒" : c.icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{c.title}</p>
                      <p className="text-[10px] text-neutral-500">{locked ? "未解禁" : c.subtitle}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>
        )}

        {aiLocked ? (
          <SectionCard title="AI研修は未解禁です" description="このコースは、ユーザー管理で「AI研修解禁」にチェックのある方だけが視聴できます。">
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              視聴したい場合は、管理者にユーザー管理画面での解禁を依頼してください。
            </p>
          </SectionCard>
        ) : aiUnlocked === null && courseId === AI_COURSE_ID ? (
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">確認中...</p>
        ) : (
          <>
        <SectionCard
          title="動画研修の全体進捗"
          description="いままでに視聴した本数と、全コンテンツに対する完了率のサマリーです。"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-neutral-600 dark:text-neutral-300">
              視聴済み: <span className="font-semibold text-neutral-900 dark:text-neutral-50">{totalWatchedCount}</span>
              <span className="mx-0.5">/</span>
              <span className="font-semibold text-neutral-900 dark:text-neutral-50">{totalVideoCount}</span> 本
            </p>
            <div className="w-full sm:max-w-xs">
              <div className="flex items-baseline justify-between text-[11px] text-neutral-600 dark:text-neutral-300">
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400">全体の完了率</span>
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                  {totalVideoCount
                    ? `${Math.round((totalWatchedCount / totalVideoCount) * 100)}% 完了`
                    : "0% 完了"}
                </span>
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                <div
                  className="h-full rounded-full"
                  style={{
                    width:
                      totalVideoCount === 0
                        ? "0%"
                        : `${Math.min(
                            100,
                            Math.round((totalWatchedCount / totalVideoCount) * 100)
                          )}%`,
                    backgroundColor: MAIN_COLOR,
                  }}
                />
              </div>
            </div>
          </div>
        </SectionCard>

        {sorted.length === 0 && !sections && (
          <p className="text-xs text-neutral-500">
            条件に合う動画がありません。
          </p>
        )}

        {sectionIdsToRender.map((sectionId) => {
          const videos = groupedBySection.get(sectionId) ?? [];
          const info = getSectionInfo(sectionId);
          const watchedCount = videos.filter((v) => watchedSet.has(v.id)).length;
          const totalCount = videos.length;
          const percent = totalCount ? Math.round((watchedCount / totalCount) * 100) : 0;
          const isUnlocked = sectionId === 0 ? true : isSectionUnlocked(sectionId);

          const cardsRow = (
            <div className="flex gap-5 overflow-x-auto pb-1">
                {videos.map((video) => {
                  const isWatched = watchedSet.has(video.id);
                  const isLocked = (video.sectionId ?? 0) > 2 && !isUnlocked;
                  const isHighlighting = highlightVideoId === video.id;

                  const tpl = video.instructorKey
                    ? INSTRUCTORS[video.instructorKey]
                    : undefined;
                  const instructorName =
                    tpl?.name || video.instructorName || "";
                  const instructorTitle =
                    tpl?.title || video.instructorTitle || "";
                  const instructorAvatar =
                    tpl?.avatar || video.instructorAvatarUrl || "";

                  return (
                    <article
                      key={video.id}
                      className={`${PANEL} relative flex min-w-[260px] max-w-[320px] flex-col overflow-hidden pb-3 text-xs transition-shadow hover:shadow-md sm:min-w-[280px] lg:min-w-[300px] ${
                        isLocked ? "opacity-70" : ""
                      } ${
                        isHighlighting
                          ? "ring-2 ring-emerald-400 shadow-[0_10px_30px_rgba(16,185,129,0.25)]"
                          : ""
                      }`}
                    >
                      {isLocked && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center">
                          <div className="absolute inset-0 bg-black/35" />
                          <div className="relative z-10 flex flex-col items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-4 text-center backdrop-blur">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-[22px] text-white">
                              🔒
                            </div>
                            <p className="text-[12px] font-semibold text-white">ロック中</p>
                            <p className="max-w-[220px] text-[11px] leading-relaxed text-white/90">
                              セクションのチェックと視聴完了で解放されます
                            </p>
                          </div>
                        </div>
                      )}

                      <div className={isLocked ? "pointer-events-none" : ""}>
                      {video.coverImageUrl && (
                        <div className="px-2 pt-3">
                          <img
                            src={video.coverImageUrl}
                            alt={video.title}
                            className="h-40 w-full rounded-lg object-cover"
                          />
                        </div>
                      )}

                      {video.subSection && (
                        <div className="px-4 pt-2.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                          {video.subSection}
                        </div>
                      )}

                      <div className="px-4 pt-2.5 text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                        {video.title}
                      </div>

                      <div className="flex items-center justify-between px-4 pt-2 text-[11px] text-neutral-600 dark:text-neutral-300">
                        <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                          {video.episodeLabel}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            isWatched
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {isWatched ? "視聴済み" : "未視聴"}
                        </span>
                      </div>

                      <div className="flex items-center justify-end px-4 pt-1 text-[11px] text-neutral-600">
                        <span>
                          {video.durationMinutes && `${video.durationMinutes}分`}
                          {video.updatedAt && ` ・ 更新: ${video.updatedAt}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 px-4 pt-2">
                        {instructorAvatar && (
                          <img
                            src={instructorAvatar}
                            alt={instructorName || "担当者"}
                            className="h-7 w-7 rounded-full border border-neutral-200 object-cover"
                          />
                        )}
                        <div className="flex flex-col leading-tight">
                          <span className="text-[11px] font-semibold text-neutral-900 dark:text-neutral-50">
                            {instructorName}
                          </span>
                          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                            {instructorTitle}
                          </span>
                        </div>
                      </div>

                      <p className="px-4 pt-2 text-[11px] leading-relaxed text-neutral-700 dark:text-neutral-200">
                        {video.description}
                      </p>

                      {video.materials && video.materials.length > 0 && (
                        <div className="px-4 pt-2 text-[11px]">
                          <div className="rounded-lg border-l-4 border-[#c4a769] bg-[#fdf7e7] px-3 py-2 dark:border-amber-400 dark:bg-neutral-800/70">
                            <div className="mb-1 flex items-center gap-1.5">
                              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#c4a769] text-[9px] font-bold text-white dark:bg-amber-400 dark:text-neutral-900">
                                資
                              </span>
                              <p className="text-[10px] font-semibold text-[#4b3b1c] dark:text-neutral-100">
                                補助資料
                              </p>
                            </div>
                            <ul className="space-y-0.5">
                              {video.materials.map((m, index) => (
                                <li key={m.url || `${video.id}-material-${index}`}>
                                  {m.url ? (
                                    <a
                                      href={m.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[10px] text-[#6f5a29] underline-offset-2 hover:underline dark:text-amber-200"
                                    >
                                      {m.label}
                                    </a>
                                  ) : (
                                    <span className="text-[10px] text-[#6f5a29] dark:text-amber-200">
                                      {m.label}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}

                      <div className="mt-2 flex gap-2 px-4 pb-3 pt-1">
                        <button
                          type="button"
                          onClick={() => openVideo(video)}
                          disabled={isLocked}
                          className={`flex-1 rounded-full px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition ${
                            isLocked
                              ? "cursor-not-allowed bg-neutral-300 dark:bg-neutral-700"
                              : "hover:brightness-110"
                          }`}
                          style={isLocked ? undefined : { backgroundColor: MAIN_COLOR }}
                        >
                          {isLocked ? "ロック中" : "詳細を確認する"}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleWatched(video.id)}
                          disabled={isLocked}
                          className={`flex-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold shadow-sm transition ${
                            isWatched
                              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-900/30 dark:text-emerald-200"
                              : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-600"
                          }`}
                        >
                          {isWatched ? "未視聴に戻す" : "視聴済みにする"}
                        </button>
                      </div>

                      </div>
                    </article>
                  );
                })}
            </div>
          );

          if (sectionId === 0) {
            return (
              <Panel key={sectionId} className="p-5">
                {cardsRow}
              </Panel>
            );
          }

          return (
            <SectionCard key={sectionId} title={info.title} description={info.description || undefined}>
              {totalCount > 0 && (
                <div className="mb-4">
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    視聴状況: <span className="font-semibold text-neutral-800 dark:text-neutral-100">{watchedCount}</span>
                    <span className="mx-0.5">/</span>
                    <span className="font-semibold text-neutral-800 dark:text-neutral-100">{totalCount}</span> 本
                    <span className="ml-2 text-[10px] text-neutral-500 dark:text-neutral-400">({percent}% 完了)</span>
                  </p>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-800">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${percent}%`, backgroundColor: MAIN_COLOR }}
                    />
                  </div>
                </div>
              )}
              {cardsRow}
            </SectionCard>
          );
        })}
          </>
        )}
      </div>
    </main>
  );
}
