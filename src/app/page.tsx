'use client';

import { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import Link from 'next/link';
import BookmarkButton from '@/components/BookmarkButton';

type TimestampItem = {
  time: string;
  seconds: number;
  label: string;
  source: string;
  authors: string[];
  count: number;
};

type HeatmapItem = {
  minute: number;
  timeLabel: string;
  count: number;
  targetSeconds?: number;
  targetLabel?: string;
};

type ArchiveItem = {
  videoId: string;
  title: string;
  publishedAt: string | null;
  updatedAt: string;
  timestampCount: number;
};

type ArchiveDetailCache = {
  videoId: string;
  title: string;
  publishedAt?: string | null;
  duration: number;
  timestamps: TimestampItem[];
  heatmapData: HeatmapItem[];
  maxCount: number;
};

type CrossTimestampHit = {
  videoId: string;
  videoTitle: string;
  publishedAt?: string | null;
  item: TimestampItem;
};

type MyBookmark = {
  id: string;
  videoId: string;
  videoTitle: string;
  time: string;
  seconds: number;
  label: string;
  createdAt: string;
};

const MANUAL_CATEGORY: { [videoId: string]: string } = {
  'Y6zCtzveayA': '☕ 雑談',
  '3P5GTXoTH_Q': '☕ 雑談',
};

const SEARCH_VARIANTS: Array<[string, string]> = [
  ['囁き', 'ささやき'],
  ['囁く', 'ささやく'],
  ['記念', 'きねん'],
  ['歌枠', 'うたわく'],
  ['歌う', 'うたう'],
  ['泣き', 'なき'],
  ['泣く', 'なく'],
  ['笑い', 'わらい'],
  ['笑う', 'わらう'],
  ['怒り', 'いかり'],
  ['怒る', 'おこる'],
  ['悲鳴', 'ひめい'],
  ['絶叫', 'ぜっきょう'],
  ['神回', 'かみかい'],
  ['初見', 'しょけん'],
  ['雑談', 'ざつだん'],
  ['耐久', 'たいきゅう'],
  ['コラボ', 'こらぼ'],
  ['配信', 'はいしん'],
  ['奇跡', 'きせき'],
  ['発狂', 'はっきょう'],
];

const toHiraganaNormalized = (text: string): string => {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
};

const normalizeSearchText = (text: string): string => {
  let normalized = toHiraganaNormalized(text);
  for (const [kanji, kana] of SEARCH_VARIANTS) {
    const hiraKanji = toHiraganaNormalized(kanji);
    const hiraKana = toHiraganaNormalized(kana);
    if (normalized.includes(hiraKanji)) {
      normalized = normalized.split(hiraKanji).join(hiraKana);
    }
  }
  return normalized;
};

const escapeRegExp = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const matchesTimestampLabel = (hiraLabel: string, normLabel: string, rawQuery: string): boolean => {
  const q = rawQuery.trim();
  if (!q) return false;

  const isShortHiraganaOnly = /^[ぁ-んー]{1,2}$/.test(q);
  if (isShortHiraganaOnly) {
    const hiraQuery = toHiraganaNormalized(q);
    const boundaryPattern = new RegExp(
      `(?:^|[\\s\\u3000・、。！？!?,./()（）\\[\\]【】「」『』〜~\\-_:：])${escapeRegExp(hiraQuery)}`
    );
    return boundaryPattern.test(hiraLabel);
  }

  const normQuery = normalizeSearchText(q);
  return normLabel.includes(normQuery);
};

const renderHighlightedLabel = (label: string, rawQuery: string) => {
  const q = rawQuery.trim();
  if (!q) return label;

  const terms = new Set<string>([q, q.normalize('NFKC')]);
  const normQ = normalizeSearchText(q);

  for (const [kanji, kana] of SEARCH_VARIANTS) {
    const hiraKanji = toHiraganaNormalized(kanji);
    const hiraKana = toHiraganaNormalized(kana);
    if (normQ.includes(hiraKana)) {
      terms.add(kanji);
      terms.add(kana);
    }
    if (normQ.includes(hiraKanji)) {
      terms.add(kanji);
      terms.add(kana);
    }
  }

  const katakanaVersion = q.replace(/[\u3041-\u3096]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );
  const hiraganaVersion = q.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
  terms.add(katakanaVersion);
  terms.add(hiraganaVersion);

  const sortedTerms = Array.from(terms)
    .filter((t) => t.length > 0)
    .sort((a, b) => b.length - a.length);

  if (sortedTerms.length === 0) return label;

  const regex = new RegExp(`(${sortedTerms.map(escapeRegExp).join('|')})`, 'gi');
  const parts = label.split(regex);

  return parts.map((part, i) => {
    const isMatch = sortedTerms.some(
      (t) => part.toLowerCase() === t.toLowerCase()
    );
    if (isMatch) {
      return (
        <mark
          key={i}
          className="bg-yellow-200 text-gray-900 font-extrabold px-1 rounded"
        >
          {part}
        </mark>
      );
    }
    return <span key={i}>{part}</span>;
  });
};

const matchCategoryFromText = (text: string): string | null => {
  if (text.includes('歌枠') || text.includes('歌ってみた') || text.includes('カラオケ')) {
    return '🎤 歌枠';
  }
  if (text.includes('耐久')) {
    return '⏳ 耐久配信';
  }
  if (text.includes('記念') || text.includes('万人') || text.includes('周年') || text.includes('初配信')) {
    return '🎉 記念配信';
  }
  if (text.includes('ASMR')) {
    return '🎧 ASMR';
  }
  if (text.includes('コラボ') || text.includes('ゲスト') || text.includes('対談') || text.includes('Phasmophobia')) {
    return '🤝 コラボ';
  }
  if (text.includes('雑談') || text.includes('振り返り')) {
    return '☕ 雑談';
  }
  if (text.includes('3Dワールド') || text.includes('３Ｄワールド')) {
    return '💫 スーパーマリオ 3Dワールド';
  }
  if (text.includes('マリオ64') || text.includes('スーパーマリオ64')) {
    return '🍄 スーパーマリオ64';
  }
  if (text.includes('サンシャイン')) {
    return '☀️ スーパーマリオサンシャイン';
  }
  if (text.includes('ギャラクシー２') || text.includes('ギャラクシー2')) {
    return '✨ スーパーマリオギャラクシー２';
  }
  if (text.includes('ギャラクシー')) {
    return '🌟 マリオギャラクシー';
  }
  if (text.includes('ペーパーマリオ')) {
    return '📜 ペーパーマリオRPG';
  }
  if (text.includes('マリオRPG')) {
    return '⭐ スーパーマリオRPG';
  }
  if (text.includes('リズム天国') || text.includes('ミラクルスターズ')) {
    return '🥁 リズム天国 ミラクルスターズ';
  }
  if (
    text.includes('ティアキン') ||
    text.includes('TotK') ||
    text.includes('ティアーズ オブ ザ キングダム') ||
    text.includes('ティアーズオブザキングダム')
  ) {
    return '🏹 ティアーズ オブ ザ キングダム';
  }
  if (
    text.includes('ブレワイ') ||
    text.includes('BotW') ||
    text.includes('ブレス オブ ザ ワイルド') ||
    text.includes('ブレスオブザワイルド')
  ) {
    return '🗡️ ブレスオブザワイルド';
  }
  if (text.includes('時のオカリナ') || text.includes('時オカ')) {
    return '🛡️ 時のオカリナ';
  }
  if (text.includes('ポケモン') || text.includes('BW') || text.includes('ホワイト') || text.includes('ポケットモンスター')) {
    return '⚡ ポケモンBW';
  }
  if (text.includes('漢字でGO')) {
    return '✏️ 漢字でGO！';
  }

  return null;
};

const CATEGORIES = [
  '🎤 歌枠',
  '⏳ 耐久配信',
  '🎉 記念配信',
  '🎧 ASMR',
  '🤝 コラボ',
  '☕ 雑談',
  '🍄 スーパーマリオ64',
  '☀️ スーパーマリオサンシャイン',
  '✨ スーパーマリオギャラクシー２',
  '🌟 マリオギャラクシー',
  '⭐ スーパーマリオRPG',
  '📜 ペーパーマリオRPG',
  '🥁 リズム天国 ミラクルスターズ',
  '🗡️ ブレスオブザワイルド',
  '🏹 ティアーズ オブ ザ キングダム',
  '🛡️ 時のオカリナ',
  '⚡ ポケモンBW',
  '✏️ 漢字でGO！',
  '💫 スーパーマリオ 3Dワールド',
];

const SERIES_GROUPS: { title: string; categories: string[] }[] = [
  {
    title: 'マリオシリーズ',
    categories: [
      '🍄 スーパーマリオ64',
      '☀️ スーパーマリオサンシャイン',
      '✨ スーパーマリオギャラクシー２',
      '🌟 マリオギャラクシー',
      '⭐ スーパーマリオRPG',
      '📜 ペーパーマリオRPG',
      '💫 スーパーマリオ 3Dワールド',
    ],
  },
  {
    title: 'ゼルダの伝説シリーズ',
    categories: [
      '🗡️ ブレスオブザワイルド',
      '🏹 ティアーズ オブ ザ キングダム',
      '🛡️ 時のオカリナ',
    ],
  },
  {
    title: 'ポケモンシリーズ',
    categories: [
      '⚡ ポケモンBW',
    ],
  },
  {
    title: 'その他',
    categories: [
      '🎤 歌枠',
      '⏳ 耐久配信',
      '🎉 記念配信',
      '🎧 ASMR',
      '🤝 コラボ',
      '☕ 雑談',
      '🥁 リズム天国 ミラクルスターズ',
      '✏️ 漢字でGO！',
    ],
  },
];

const normalizeLegacyCategoryName = (cat: string): string => {
  if (cat === '🐈 スーパーマリオ 3Dワールド') {
    return '💫 スーパーマリオ 3Dワールド';
  }
  return cat;
};

const parseArchiveTimestamp = (item: ArchiveItem): number | null => {
  const raw = item.publishedAt || item.updatedAt;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms : null;
};

const formatPublishedDate = (raw?: string | null): string | null => {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime()) || d.getTime() <= 0) return null;
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

export default function Home() {
  const [archives, setArchives] = useState<ArchiveItem[]>([]);
  const [categories, setCategories] = useState<string[]>(CATEGORIES);
  const [seriesMap, setSeriesMap] = useState<Record<string, string>>({});
  const [manualAssignments, setManualAssignments] = useState<Record<string, string>>({});
  const [loadingArchives, setLoadingArchives] = useState(true);
  const [timestampQuery, setTimestampQuery] = useState('');
  const deferredQuery = useDeferredValue(timestampQuery);
  const [detailCache, setDetailCache] = useState<Record<string, ArchiveDetailCache>>({});
  const [indexedCount, setIndexedCount] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState<boolean>(true);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'timestamps'>('newest');
  const [isLocal, setIsLocal] = useState(false);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>('読込中...');

  const [myBookmarks, setMyBookmarks] = useState<MyBookmark[]>([]);
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<string[]>([]);

  const [analyzing, setAnalyzing] = useState(false);
  const [activeArchiveTitle, setActiveArchiveTitle] = useState<string>('');
  const [data, setData] = useState<{
    videoId: string;
    title: string;
    publishedAt?: string | null;
    duration: number;
    timestamps: TimestampItem[];
    heatmapData: HeatmapItem[];
    maxCount: number;
  } | null>(null);
  const [error, setError] = useState('');
  const [activeItem, setActiveItem] = useState<TimestampItem | null>(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);

  const getCategory = useCallback(
    (item: ArchiveItem) => {
      const cleanId = item.videoId.trim();
      if (manualAssignments[cleanId]) {
        return normalizeLegacyCategoryName(manualAssignments[cleanId]);
      }
      if (MANUAL_CATEGORY[cleanId]) {
        return normalizeLegacyCategoryName(MANUAL_CATEGORY[cleanId]);
      }

      const title = item.title.trim();

      const bracketMatches = title.match(/【([^】]+)】/g);
      if (bracketMatches) {
        const bracketText = bracketMatches
          .map(m => m.slice(1, -1))
          .filter(inner => !inner.includes('電撃ニコ'))
          .join(' ');

        if (bracketText) {
          const catFromBracket = matchCategoryFromText(bracketText);
          if (catFromBracket) return catFromBracket;
        }
      }

      if (title.startsWith('雑談') || title.includes('歌枠のお礼') || title.includes('振り返り')) {
        return '☕ 雑談';
      }

      const catFromTitle = matchCategoryFromText(title);
      if (catFromTitle) return catFromTitle;

      return '☕ 雑談';
    },
    [manualAssignments]
  );

  const groupedCategorySections = useMemo(() => {
    const orderedGroups = [
      'マリオシリーズ',
      'ゼルダの伝説シリーズ',
      'ポケモンシリーズ',
      'その他',
    ];

    const allKnownCats = Array.from(new Set([...CATEGORIES, ...categories]));

    const oldestTimeByCategory = new Map<string, number>();
    archives.forEach((item) => {
      const cat = getCategory(item);
      const ms = parseArchiveTimestamp(item);
      if (ms === null) return;
      const prev = oldestTimeByCategory.get(cat);
      if (prev === undefined || ms < prev) {
        oldestTimeByCategory.set(cat, ms);
      }
    });

    return orderedGroups.map((groupTitle) => {
      const matchedCats = allKnownCats.filter((cat) => {
        const assignedSeries = seriesMap[cat];
        if (assignedSeries) {
          return assignedSeries === groupTitle;
        }
        const fallbackGroup = SERIES_GROUPS.find((g) => g.title === groupTitle);
        if (groupTitle === 'その他') {
          const inOtherSeries = SERIES_GROUPS.some(
            (g) => g.title !== 'その他' && g.categories.includes(cat)
          );
          return !inOtherSeries;
        }
        return fallbackGroup ? fallbackGroup.categories.includes(cat) : false;
      });

      const uniqueCats = Array.from(new Set(matchedCats));

      uniqueCats.sort((a, b) => {
        const timeA = oldestTimeByCategory.get(a);
        const timeB = oldestTimeByCategory.get(b);
        if (timeA === undefined && timeB === undefined) return 0;
        if (timeA === undefined) return 1;
        if (timeB === undefined) return -1;
        return timeA - timeB;
      });

      return {
        title: groupTitle,
        categories: uniqueCats,
      };
    });
  }, [archives, categories, seriesMap, getCategory]);

  useEffect(() => {
    let baseCategories = [...CATEGORIES];
    let baseSeriesMap: Record<string, string> = {};
    let baseAssignments: Record<string, string> = {};

    if (typeof window !== 'undefined') {
      if (window.innerWidth < 640) {
        setIsCategoryMenuOpen(false);
      }

      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        setIsLocal(true);
      }

      const savedBookmarks = localStorage.getItem('my_clip_bookmarks');
      if (savedBookmarks) {
        try {
          setMyBookmarks(JSON.parse(savedBookmarks));
        } catch (e) {
          console.error('切り抜きポイントの読み込みに失敗しました:', e);
        }
      }

      const savedCategories = localStorage.getItem('custom_categories');
      if (savedCategories) {
        try {
          const parsed = JSON.parse(savedCategories);
          if (Array.isArray(parsed)) {
            const normalizedParsed = parsed.map((c: string) => normalizeLegacyCategoryName(c));
            baseCategories = Array.from(new Set([...CATEGORIES, ...normalizedParsed]));
          }
        } catch (e) {
          console.error('カテゴリの読み込みに失敗しました:', e);
        }
      }

      const savedSeriesMap = localStorage.getItem('category_series_map');
      if (savedSeriesMap) {
        try {
          baseSeriesMap = { ...baseSeriesMap, ...JSON.parse(savedSeriesMap) };
        } catch (e) {
          console.error('シリーズ分類の読み込みに失敗しました:', e);
        }
      }

      const savedAssignments = localStorage.getItem('manual_assignments');
      if (savedAssignments) {
        try {
          const parsedAssignments: Record<string, string> = JSON.parse(savedAssignments);
          Object.entries(parsedAssignments).forEach(([k, v]) => {
            baseAssignments[k] = normalizeLegacyCategoryName(v);
          });
        } catch (e) {
          console.error('手動割り当ての読み込みに失敗しました:', e);
        }
      }
    }

    setCategories(baseCategories);
    setSeriesMap(baseSeriesMap);
    setManualAssignments(baseAssignments);

    const fetchInitialData = async () => {
      try {
        const [dataRes, cfgRes] = await Promise.all([
          fetch('/api/data'),
          fetch('/api/category-config'),
        ]);

        if (cfgRes.ok) {
          const serverCfg = await cfgRes.json();
          if (Array.isArray(serverCfg.categories) && serverCfg.categories.length > 0) {
            const normalizedServerCats = serverCfg.categories.map((c: string) =>
              normalizeLegacyCategoryName(c)
            );
            setCategories(normalizedServerCats);
          }
          if (serverCfg.seriesMap && typeof serverCfg.seriesMap === 'object') {
            setSeriesMap((prev) => ({ ...prev, ...serverCfg.seriesMap }));
          }
          if (serverCfg.manualAssignments && typeof serverCfg.manualAssignments === 'object') {
            const normalizedServerAssign: Record<string, string> = {};
            Object.entries(serverCfg.manualAssignments).forEach(([k, v]) => {
              if (typeof v === 'string') {
                normalizedServerAssign[k] = normalizeLegacyCategoryName(v);
              }
            });
            setManualAssignments((prev) => ({ ...prev, ...normalizedServerAssign }));
          }
        }

        if (dataRes.ok) {
          const list = await dataRes.json();
          setArchives(list);
          setLastUpdatedTime(
            new Date().toLocaleTimeString('ja-JP', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })
          );
        }
      } catch (e) {
        console.error('初期データの取得に失敗しました:', e);
      } finally {
        setLoadingArchives(false);
      }
    };
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (archives.length === 0) return;
    let cancelled = false;

    const prefetchDetails = async () => {
      const targetItems = archives.filter((a) => (a.timestampCount ?? 0) > 0);
      let done = 0;
      const concurrency = 8;

      for (let i = 0; i < targetItems.length; i += concurrency) {
        if (cancelled) return;
        const batch = targetItems.slice(i, i + concurrency);
        await Promise.all(
          batch.map(async (arch) => {
            try {
              const res = await fetch(`/api/data?videoId=${arch.videoId}`);
              if (!res.ok) return;
              const json: ArchiveDetailCache = await res.json();
              if (cancelled) return;
              setDetailCache((prev) => {
                if (prev[arch.videoId]) return prev;
                return {
                  ...prev,
                  [arch.videoId]: {
                    ...json,
                    videoId: arch.videoId,
                    title: json.title || arch.title,
                    publishedAt: json.publishedAt ?? arch.publishedAt,
                  },
                };
              });
            } catch {
              // 取得失敗時はスキップ
            } finally {
              done += 1;
            }
          })
        );
        if (!cancelled) {
          setIndexedCount(done);
        }
      }
    };

    prefetchDetails();
    return () => {
      cancelled = true;
    };
  }, [archives]);

  const { hits: crossTimestampHits, totalHits: crossTimestampTotal } = useMemo(() => {
    const rawQuery = deferredQuery.trim();
    if (!rawQuery) {
      return { hits: [] as CrossTimestampHit[], totalHits: 0 };
    }

    const archiveMetaMap = new Map<string, { dateMs: number }>();
    archives.forEach((arch) => {
      const rawDate = arch.publishedAt || arch.updatedAt || '';
      const dateMs = rawDate ? new Date(rawDate).getTime() : 0;
      archiveMetaMap.set(arch.videoId, {
        dateMs: Number.isFinite(dateMs) ? dateMs : 0,
      });
    });

    const matched: Array<CrossTimestampHit & { dateMs: number; overlapCount: number }> = [];
    archives.forEach((arch) => {
      const detail = detailCache[arch.videoId];
      if (!detail?.timestamps) return;
      const dateMs = detail.publishedAt
        ? new Date(detail.publishedAt).getTime() || archiveMetaMap.get(arch.videoId)?.dateMs || 0
        : archiveMetaMap.get(arch.videoId)?.dateMs || 0;

      detail.timestamps.forEach((ts) => {
        if (!ts.label) return;
        const hiraLabel = toHiraganaNormalized(ts.label);
        const normLabel = normalizeSearchText(ts.label);
        if (matchesTimestampLabel(hiraLabel, normLabel, rawQuery)) {
          matched.push({
            videoId: arch.videoId,
            videoTitle: detail.title || arch.title,
            publishedAt: detail.publishedAt ?? arch.publishedAt,
            item: ts,
            dateMs,
            overlapCount: ts.count ?? 1,
          });
        }
      });
    });

    matched.sort((a, b) => {
      if (sortOrder === 'timestamps') {
        if (b.overlapCount !== a.overlapCount) return b.overlapCount - a.overlapCount;
        if (b.dateMs !== a.dateMs) return b.dateMs - a.dateMs;
        return a.item.seconds - b.item.seconds;
      }
      if (b.dateMs !== a.dateMs) {
        return sortOrder === 'newest' ? b.dateMs - a.dateMs : a.dateMs - b.dateMs;
      }
      return a.item.seconds - b.item.seconds;
    });

    const maxVisible = 100;
    return {
      hits: matched.slice(0, maxVisible).map(({ dateMs: _d, overlapCount: _o, ...rest }) => rest),
      totalHits: matched.length,
    };
  }, [deferredQuery, archives, detailCache, sortOrder]);

  const handleOpenCrossHit = (hit: CrossTimestampHit) => {
    const cached = detailCache[hit.videoId];
    const baseData = cached ?? {
      videoId: hit.videoId,
      title: hit.videoTitle,
      publishedAt: hit.publishedAt,
      duration: 0,
      timestamps: [hit.item],
      heatmapData: [],
      maxCount: 1,
    };

    setData(baseData);
    setActiveArchiveTitle(hit.videoTitle);
    setError('');
    setIsVideoLoaded(false);
    setActiveItem(hit.item);
  };

  const toggleBookmark = (item: TimestampItem) => {
    if (!data) return;
    const clipId = `${data.videoId}_${item.seconds}`;
    const exists = myBookmarks.some(b => b.id === clipId);

    let updated: MyBookmark[];
    if (exists) {
      updated = myBookmarks.filter(b => b.id !== clipId);
      setSelectedBookmarkIds(selectedBookmarkIds.filter(id => id !== clipId));
    } else {
      const currentTitle = data.title || activeArchiveTitle || '無題の配信';
      const newBookmark: MyBookmark = {
        id: clipId,
        videoId: data.videoId,
        videoTitle: currentTitle,
        time: item.time,
        seconds: item.seconds,
        label: item.label,
        createdAt: new Date().toLocaleString('ja-JP'),
      };
      updated = [newBookmark, ...myBookmarks];
    }

    setMyBookmarks(updated);
    localStorage.setItem('my_clip_bookmarks', JSON.stringify(updated));
  };

  const removeBookmark = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = myBookmarks.filter(b => b.id !== id);
    setMyBookmarks(updated);
    setSelectedBookmarkIds(selectedBookmarkIds.filter(i => i !== id));
    localStorage.setItem('my_clip_bookmarks', JSON.stringify(updated));
  };

  const toggleSelectBookmark = (id: string) => {
    if (selectedBookmarkIds.includes(id)) {
      setSelectedBookmarkIds(selectedBookmarkIds.filter(i => i !== id));
    } else {
      setSelectedBookmarkIds([...selectedBookmarkIds, id]);
    }
  };

  const toggleSelectAllBookmarks = () => {
    if (selectedBookmarkIds.length === myBookmarks.length) {
      setSelectedBookmarkIds([]);
    } else {
      setSelectedBookmarkIds(myBookmarks.map(b => b.id));
    }
  };

  const handleBulkRemoveBookmarks = () => {
    if (selectedBookmarkIds.length === 0) return;
    if (!confirm(`選択した ${selectedBookmarkIds.length}件の切り抜きポイントを削除しますか？`)) return;

    const updated = myBookmarks.filter(b => !selectedBookmarkIds.includes(b.id));
    setMyBookmarks(updated);
    setSelectedBookmarkIds([]);
    localStorage.setItem('my_clip_bookmarks', JSON.stringify(updated));
  };

  const filteredArchives = useMemo(() => {
    let result = [...archives];

    if (selectedCategory !== 'all' && selectedCategory !== 'bookmarks') {
      const normalizedSelected = normalizeLegacyCategoryName(selectedCategory);
      result = result.filter((item) => getCategory(item) === normalizedSelected);
    }

    result.sort((a, b) => {
      if (sortOrder === 'timestamps') {
        const countA = a.timestampCount ?? 0;
        const countB = b.timestampCount ?? 0;
        if (countB !== countA) return countB - countA;
        const dateA = new Date(a.publishedAt || a.updatedAt || 0).getTime();
        const dateB = new Date(b.publishedAt || b.updatedAt || 0).getTime();
        return dateB - dateA;
      }
      const dateA = new Date(a.publishedAt || a.updatedAt || 0).getTime();
      const dateB = new Date(b.publishedAt || b.updatedAt || 0).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [archives, selectedCategory, sortOrder, getCategory]);

  const optimizedHeatmap = useMemo(() => {
    if (!data?.heatmapData) return [];
    const raw = data.heatmapData;

    const maxBars = 120;
    const step = Math.max(1, Math.ceil(raw.length / maxBars));
    const result: HeatmapItem[] = [];

    for (let i = 0; i < raw.length; i += step) {
      const chunk = raw.slice(i, i + step);
      const rawMax = Math.max(...chunk.map(c => c.count || 0));
      const adjustedCount = Math.max(rawMax > 0 ? 1 : 0, Math.round(rawMax / 10));

      const midIndex = Math.floor(chunk.length / 2);
      const representative = chunk[midIndex];
      const repSeconds = representative.minute * 60;

      const chunkStartSec = chunk[0].minute * 60;
      const chunkEndSec = (chunk[chunk.length - 1].minute + 1) * 60;

      let targetSeconds = repSeconds;
      let targetLabel = `${representative.timeLabel} 周辺の盛り上がり`;

      if (data?.timestamps && data.timestamps.length > 0) {
        let matchedTs = data.timestamps.find(
          ts => ts.seconds >= chunkStartSec && ts.seconds < chunkEndSec
        );

        if (!matchedTs) {
          let closest = data.timestamps[0];
          let minDiff = Math.abs(closest.seconds - repSeconds);
          for (const ts of data.timestamps) {
            const diff = Math.abs(ts.seconds - repSeconds);
            if (diff < minDiff) {
              minDiff = diff;
              closest = ts;
            }
          }
          if (minDiff <= 300) {
            matchedTs = closest;
          }
        }

        if (matchedTs) {
          targetSeconds = matchedTs.seconds;
          targetLabel = matchedTs.label;
        }
      }

      result.push({
        minute: representative.minute,
        timeLabel: representative.timeLabel,
        count: adjustedCount,
        targetSeconds,
        targetLabel,
      });
    }
    return result;
  }, [data?.heatmapData, data?.timestamps]);

  const optimizedMaxCount = useMemo(() => {
    if (optimizedHeatmap.length === 0) return 1;
    return Math.max(...optimizedHeatmap.map(item => item.count));
  }, [optimizedHeatmap]);

  const handleSelectArchive = async (videoId: string, title?: string) => {
    setAnalyzing(true);
    setError('');
    setData(null);
    setActiveItem(null);
    if (title) {
      setActiveArchiveTitle(title);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const res = await fetch(`/api/data?videoId=${videoId}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setAnalyzing(false);
        return;
      }

      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${videoId}` }),
      });
      const analyzeJson = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analyzeJson.error || 'エラーが発生しました');
      setData(analyzeJson);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleOpenModal = (item: TimestampItem) => {
    setIsVideoLoaded(false);
    setActiveItem(item);
  };

  const handleHeatmapClick = (item: HeatmapItem) => {
    const seconds = item.targetSeconds !== undefined ? item.targetSeconds : item.minute * 60;
    const label = item.targetLabel || `${item.timeLabel} 周辺の盛り上がり`;

    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const timeStr = hours > 0
      ? `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${mins}:${secs.toString().padStart(2, '0')}`;

    setActiveItem({
      time: timeStr,
      seconds,
      label,
      source: '熱量集計',
      authors: ['システム'],
      count: item.count || 1,
    });
    setIsVideoLoaded(false);
  };

  const renderArchiveCard = (item: ArchiveItem) => {
    const isSelected = data?.videoId === item.videoId;
    const formattedDate = formatPublishedDate(item.publishedAt || item.updatedAt);
    const tsCount = item.timestampCount ?? 0;

    return (
      <div
        key={item.videoId}
        onClick={() => handleSelectArchive(item.videoId, item.title)}
        className={`group bg-white border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col ${
          isSelected ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-blue-300'
        }`}
      >
        <div className="aspect-video bg-gray-900 relative overflow-hidden">
          <img
            src={`https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`}
            alt={item.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <span className="opacity-0 group-hover:opacity-100 bg-blue-600 text-white text-[11px] sm:text-xs font-bold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full shadow transition-opacity">
              📊 見どころを解析
            </span>
          </div>
        </div>

        <div className="p-2 sm:p-3 flex-1 flex flex-col justify-between gap-1.5 sm:gap-2.5">
          <h3 className="text-[11px] sm:text-xs font-bold text-gray-800 line-clamp-2 group-hover:text-blue-600 transition-colors leading-snug sm:leading-relaxed">
            {item.title}
          </h3>

          <div className="pt-1.5 sm:pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] sm:text-[11px]">
            <span className="text-gray-400 font-mono truncate">
              {formattedDate ?? '日付不明'}
            </span>
            <span
              className={`font-bold px-1.5 sm:px-2 py-0.5 rounded-full shrink-0 ${
                tsCount >= 20
                  ? 'bg-orange-100 text-orange-700'
                  : tsCount > 0
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              ⚡ {tsCount}件
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 font-sans pb-16">
      <header className="bg-white border-b sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <span className="text-xl sm:text-2xl shrink-0">⚡</span>
              <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-gray-900 truncate">
                電撃ニコ 見どころアーカイブ解析所
              </h1>
            </div>
            <span className="bg-yellow-100 text-yellow-800 text-[11px] sm:text-xs font-bold px-2 py-0.5 rounded-full shrink-0">
              {archives.length}件収録
            </span>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3">
            <span className="text-[10px] sm:text-[11px] font-mono text-gray-400">
              最終反映: {lastUpdatedTime}
            </span>
            {isLocal && (
              <Link
                href="/admin"
                className="text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded transition-colors"
              >
                ⚙️ データ管理 (/admin)
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 pt-4 sm:pt-6 space-y-6 sm:space-y-8">
        {/* 🔍 見どころ解析パネル（解析結果・エラー・ローディング時のみ表示） */}
        {(data || analyzing || error) && (
          <section className="bg-white border rounded-xl p-4 sm:p-5 shadow-sm">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm font-bold">
                ⚠️ {error}
              </div>
            )}

            {analyzing && (
              <div className="py-8 flex flex-col items-center justify-center text-gray-500 gap-2">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm font-bold">コメントとチャット欄から見どころを集計中...</p>
              </div>
            )}

            {(data || analyzing) && (
              <div className="space-y-4 sm:space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-base sm:text-lg text-gray-900 leading-snug">
                      {data?.title ||
                       activeArchiveTitle ||
                       (analyzing ? '配信情報を読み込み中...' : 'タイトル不明')}
                    </h3>
                    <p className="text-[11px] sm:text-xs text-gray-500 mt-1">
                      {data ? (
                        (() => {
                          const rawPublishedAt =
                            data.publishedAt ??
                            archives.find((a) => a.videoId === data.videoId)?.publishedAt;
                          const formattedDate = formatPublishedDate(rawPublishedAt);
                          const effectiveDuration = data.duration > 0
                            ? data.duration
                            : (data.heatmapData && data.heatmapData.length > 0
                                ? data.heatmapData[data.heatmapData.length - 1].minute * 60
                                : 0);
                          const hours = Math.floor(effectiveDuration / 3600);
                          const mins = Math.floor((effectiveDuration % 3600) / 60);
                          return (
                            <>
                              {formattedDate && <>配信日: {formattedDate} ／ </>}
                              総時間: {hours}時間{mins}分 ／ 抽出タイムスタンプ: <span className="font-bold text-blue-600">{data.timestamps.length}件</span>
                            </>
                          );
                        })()
                      ) : (
                        'データを解析中...'
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => setData(null)}
                    className="text-xs text-gray-400 hover:text-gray-600 self-end sm:self-center cursor-pointer shrink-0"
                  >
                    ✕ 解析結果を閉じる
                  </button>
                </div>

                {data && optimizedHeatmap.length > 0 && (
                  <div className="bg-gray-50 border rounded-lg p-3 sm:p-4">
                    <h4 className="text-xs font-bold text-gray-700 mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-0.5">
                      <span>🔥 チャット熱量ヒートマップ</span>
                      <span className="text-[10px] sm:text-[11px] text-gray-400 font-normal">バーをタップするとその時間にジャンプ</span>
                    </h4>

                    <div className="h-24 sm:h-28 flex items-end gap-[1px] bg-white border-b border-x p-1 rounded">
                      {optimizedHeatmap.map((item, idx) => {
                        const count = item.count || 0;
                        const heightPercent = Math.max(
                          6,
                          Math.min(100, (count / optimizedMaxCount) * 100)
                        );
                        const isHot = count > optimizedMaxCount * 0.3;

                        return (
                          <div
                            key={idx}
                            onClick={() => handleHeatmapClick(item)}
                            title={`${item.targetLabel || item.timeLabel} 注目数: ${count}人`}
                            className={`flex-1 rounded-t cursor-pointer transition-all hover:opacity-80 ${
                              isHot ? 'bg-red-500' : count > 0 ? 'bg-blue-400' : 'bg-gray-200'
                            }`}
                            style={{ height: count > 0 ? `${heightPercent}%` : '4%' }}
                          />
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[10px] sm:text-[11px] text-gray-400 mt-1 px-1">
                      <span>0:00</span>
                      <span>{optimizedHeatmap[Math.floor(optimizedHeatmap.length / 2)]?.timeLabel || ''}</span>
                      <span>{optimizedHeatmap[optimizedHeatmap.length - 1]?.timeLabel || ''}</span>
                    </div>
                  </div>
                )}

                {/* タイムスタンプ一覧 */}
                {data && (
                  <div className="border rounded-lg divide-y bg-white max-h-[340px] sm:max-h-[380px] overflow-y-auto">
                    {data.timestamps.length === 0 ? (
                      <p className="p-4 text-sm text-gray-500">タイムスタンプが見つかりませんでした</p>
                    ) : (
                      data.timestamps.map((item, idx) => {
                        const clipId = `${data.videoId}_${item.seconds}`;
                        const isBookmarked = myBookmarks.some(b => b.id === clipId);
                        const authorName = item.authors?.[0] || '視聴者';
                        const count = item.count || 1;
                        const otherCount = count - 1;

                        return (
                          <div
                            key={idx}
                            className="p-2.5 sm:p-3 flex items-center gap-2.5 sm:gap-3 text-xs sm:text-sm hover:bg-blue-50 transition-colors"
                          >
                            <span
                              onClick={() => handleOpenModal(item)}
                              className="font-mono font-bold text-blue-600 w-14 sm:w-16 shrink-0 cursor-pointer hover:underline"
                            >
                              {item.time}
                            </span>
                            <span
                              onClick={() => handleOpenModal(item)}
                              className="flex-1 flex flex-wrap items-center gap-1.5 sm:gap-2 cursor-pointer"
                            >
                              <span>{item.label}</span>
                              {count > 1 && (
                                <span className="bg-orange-100 text-orange-700 text-[11px] sm:text-xs px-2 sm:px-2.5 py-0.5 rounded-full font-bold shrink-0">
                                  🔥 {count}人設定
                                </span>
                              )}
                            </span>

                            <BookmarkButton
                              initialBookmarked={isBookmarked}
                              onToggle={() => toggleBookmark(item)}
                            />

                            <span className="text-xs text-gray-400 shrink-0 hidden sm:inline">
                              [{item.source}: {authorName} {otherCount > 0 ? `他${otherCount}人` : ''}]
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* 📚 保存済みアーカイブ一覧セクション */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
            <h2 className="text-base font-extrabold text-gray-800 flex items-center gap-2">
              <span>🎬</span>
              <span>{selectedCategory === 'bookmarks' ? '⭐ マイ切り抜きポイント一覧' : 'アーカイブ一覧'}</span>
              <span className="text-xs font-normal text-gray-500">
                {selectedCategory === 'bookmarks' ? `${myBookmarks.length}件保存中` : `${filteredArchives.length}件表示中`}
              </span>
            </h2>

            {selectedCategory !== 'bookmarks' && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <div className="relative w-full sm:w-80">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">
                    🔍
                  </span>
                  <input
                    type="text"
                    value={timestampQuery}
                    onChange={(e) => setTimestampQuery(e.target.value)}
                    placeholder="気になるワードを検索... (神プレー/悲鳴/🌴🌴)"
                    className="border border-gray-300 bg-white pl-8 pr-8 py-2 sm:py-1.5 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {timestampQuery && (
                    <button
                      type="button"
                      onClick={() => setTimestampQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs cursor-pointer"
                      aria-label="検索クリア"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest' | 'timestamps')}
                  className="border border-gray-300 bg-white px-3 py-2 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-bold text-gray-700 shrink-0"
                >
                  <option value="newest">新しい順</option>
                  <option value="oldest">古い順</option>
                  <option value="timestamps">タイムスタンプが多い順</option>
                </select>
              </div>
            )}
          </div>

          {/* 🔎 全アーカイブ タイムスタンプ横断検索結果 */}
          {timestampQuery.trim() !== '' && selectedCategory !== 'bookmarks' && (
            <div className="bg-white border-2 border-blue-200 rounded-xl p-3.5 sm:p-4 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="font-bold text-gray-800 flex flex-wrap items-center gap-1.5">
                  <span>🔎</span>
                  <span>「{timestampQuery.trim()}」の検索結果</span>
                  <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-extrabold">
                    {crossTimestampTotal}件ヒット
                  </span>
                </div>
                <span className="text-[11px] text-gray-400 font-mono">
                  読込済: {indexedCount}配信
                </span>
              </div>

              {crossTimestampHits.length === 0 ? (
                <p className="text-xs text-gray-500 py-3">
                  該当するタイムスタンプは見つかりませんでした（まだ読込中の配信がある場合は数秒後に再表示されます）。
                </p>
              ) : (
                <>
                  {crossTimestampTotal > crossTimestampHits.length && (
                    <p className="text-[11px] text-gray-400">
                      件数が多いため上位{crossTimestampHits.length}件を表示しています。
                    </p>
                  )}
                  <div className="divide-y border rounded-lg max-h-[340px] overflow-y-auto">
                    {crossTimestampHits.map((hit, idx) => (
                      <div
                        key={`${hit.videoId}_${hit.item.seconds}_${idx}`}
                        onClick={() => handleOpenCrossHit(hit)}
                        className="p-2.5 sm:p-3 hover:bg-blue-50 transition-colors cursor-pointer flex items-start sm:items-center justify-between gap-2.5 sm:gap-3 text-xs sm:text-sm"
                      >
                        <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                          <span className="font-mono font-bold text-blue-600 shrink-0">
                            ▶ {hit.item.time}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-gray-900 break-words flex flex-wrap items-center gap-1.5">
                              <span>{renderHighlightedLabel(hit.item.label, deferredQuery)}</span>
                              {(hit.item.count || 1) > 1 && (
                                <span className="bg-orange-100 text-orange-700 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full font-bold">
                                  🔥 {hit.item.count}人設定
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-500 truncate mt-0.5">
                              {hit.videoTitle}
                              {formatPublishedDate(hit.publishedAt) && (
                                <span className="ml-2 font-mono text-gray-400">
                                  ({formatPublishedDate(hit.publishedAt)})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-blue-600 shrink-0">
                          再生 ↗
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* 🎯 カテゴリ目次（開閉式：シリーズ・ジャンル別グループ表示） */}
          <div className="bg-white border rounded-xl p-3.5 sm:p-4 shadow-sm space-y-3">
            <div className="text-xs font-bold text-gray-500 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsCategoryMenuOpen((prev) => !prev)}
                className="flex items-center gap-1.5 text-left hover:text-gray-800 transition-colors cursor-pointer"
              >
                <span>📂 カテゴリ・シリーズで絞り込み</span>
                <span className="hidden sm:inline text-[11px] font-normal text-gray-400">
                  （{isCategoryMenuOpen ? 'クリックで閉じる' : 'クリックで開く'}）
                </span>
              </button>

              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                {selectedCategory !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    className="text-blue-600 hover:underline text-xs cursor-pointer"
                  >
                    ✕ 解除
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsCategoryMenuOpen((prev) => !prev)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-[11px] px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                >
                  {isCategoryMenuOpen ? '▲ 閉じる' : '▼ 一覧を開く'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`text-xs font-bold px-3 py-1.5 rounded-full transition-all cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                すべて ({archives.length})
              </button>

              <button
                type="button"
                onClick={() => setSelectedCategory('bookmarks')}
                className={`text-xs font-bold px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 cursor-pointer ${
                  selectedCategory === 'bookmarks'
                    ? 'bg-amber-500 text-white shadow'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                }`}
              >
                <img
                  src="/lottie/nicosuko_bookmark_on_picture.png"
                  alt="マイ切り抜きポイント"
                  className="w-4 h-4 object-contain select-none pointer-events-none"
                />
                マイ切り抜きポイント ({myBookmarks.length})
              </button>

              {!isCategoryMenuOpen &&
                selectedCategory !== 'all' &&
                selectedCategory !== 'bookmarks' && (
                  <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-blue-600 text-white shadow flex items-center gap-1.5">
                    <span>選択中: {selectedCategory}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('all')}
                      className="hover:text-blue-200 cursor-pointer"
                      aria-label="絞り込み解除"
                    >
                      ✕
                    </button>
                  </span>
                )}
            </div>

            {isCategoryMenuOpen && (
              <div className="space-y-3.5 pt-2 border-t border-gray-100">
                {groupedCategorySections.map((group) => {
                  const visibleCats = group.categories.filter(
                    (cat) => archives.filter((item) => getCategory(item) === cat).length > 0
                  );
                  if (visibleCats.length === 0) return null;

                  return (
                    <div key={group.title} className="space-y-1.5">
                      <div className="flex items-center gap-2 text-[11px] font-extrabold text-gray-600">
                        <span className="shrink-0">{group.title}</span>
                        <span className="h-[1px] flex-1 bg-gray-200" />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {visibleCats.map((cat) => {
                          const count = archives.filter((item) => getCategory(item) === cat).length;
                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setSelectedCategory(cat)}
                              className={`text-xs font-bold px-3 py-1.5 rounded-full transition-all cursor-pointer ${
                                selectedCategory === cat
                                  ? 'bg-blue-600 text-white shadow'
                                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                              }`}
                            >
                              {cat} ({count})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {selectedCategory === 'bookmarks' && myBookmarks.length > 0 && (
            <div className="bg-white border rounded-xl p-3 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-gray-700 select-none">
                <input
                  type="checkbox"
                  checked={selectedBookmarkIds.length === myBookmarks.length && myBookmarks.length > 0}
                  onChange={toggleSelectAllBookmarks}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                />
                すべて選択 ({selectedBookmarkIds.length} / {myBookmarks.length}件 選択中)
              </label>

              <button
                type="button"
                disabled={selectedBookmarkIds.length === 0}
                onClick={handleBulkRemoveBookmarks}
                className="bg-red-50 hover:bg-red-100 text-red-600 font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1"
              >
                🗑️ 選択した項目を一括削除 ({selectedBookmarkIds.length}件)
              </button>
            </div>
          )}

          {selectedCategory === 'bookmarks' ? (
            myBookmarks.length === 0 ? (
              <div className="bg-white border rounded-xl p-10 sm:p-12 text-center text-gray-500 text-sm space-y-2">
                <p className="font-bold text-base">⭐ マイ切り抜きポイントはまだありません</p>
                <p className="text-xs text-gray-400">配信を解析したときに、タイムスタンプの横にある切り抜きポイントボタンを押すとここに保存されます！</p>
              </div>
            ) : (
              <div className="bg-white border rounded-xl divide-y overflow-hidden">
                {myBookmarks.map((clip) => {
                  const isChecked = selectedBookmarkIds.includes(clip.id);
                  return (
                    <div
                      key={clip.id}
                      className={`p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 transition-colors ${
                        isChecked ? 'bg-blue-50/40' : 'hover:bg-amber-50/50'
                      }`}
                    >
                      <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectBookmark(clip.id)}
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer mt-1 sm:mt-0 shrink-0"
                        />

                        <img
                          src={`https://i.ytimg.com/vi/${clip.videoId}/mqdefault.jpg`}
                          alt={clip.videoTitle}
                          className="w-24 sm:w-28 aspect-video object-cover rounded shrink-0 bg-gray-900 cursor-pointer"
                          onClick={() => handleSelectArchive(clip.videoId, clip.videoTitle)}
                        />
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <span
                              onClick={() => {
                                handleSelectArchive(clip.videoId, clip.videoTitle);
                                setTimeout(() => {
                                  setActiveItem({
                                    time: clip.time,
                                    seconds: clip.seconds,
                                    label: clip.label,
                                    source: 'マイ切り抜きポイント',
                                    authors: ['自分'],
                                    count: 1,
                                  });
                                }, 600);
                              }}
                              className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded cursor-pointer hover:underline text-xs"
                            >
                              ▶ {clip.time} から再生
                            </span>
                            <span className="text-[10px] text-gray-400">{clip.createdAt}</span>
                          </div>
                          <h4 className="text-xs font-extrabold text-gray-800 line-clamp-1">
                            {clip.label}
                          </h4>
                          <p className="text-[11px] text-gray-500 line-clamp-1">
                            動画: {clip.videoTitle}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          onClick={(e) => removeBookmark(clip.id, e)}
                          className="text-xs bg-red-50 hover:bg-red-100 text-red-600 font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                        >
                          🗑️ 削除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : loadingArchives ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              アーカイブを読み込み中...
            </div>
          ) : filteredArchives.length === 0 ? (
            <div className="bg-white border rounded-xl p-8 text-center text-gray-500 text-sm">
              該当するアーカイブが見つかりませんでした。
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
              {filteredArchives.map((item) => renderArchiveCard(item))}
            </div>
          )}
        </section>
      </div>

      {/* 🎬 ポップアップ小窓レイヤー */}
      {activeItem && data && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-xl overflow-hidden animate-fadeIn">
            <div className="flex justify-between items-center bg-gray-900 text-white px-3.5 sm:px-4 py-2.5 sm:py-3">
              <div className="flex items-center gap-2 truncate">
                <span className="font-mono text-blue-400 font-bold text-xs sm:text-sm">{activeItem.time}</span>
                <span className="text-xs sm:text-sm truncate">{activeItem.label}</span>
              </div>
              <button
                onClick={() => setActiveItem(null)}
                className="text-gray-400 hover:text-white text-lg sm:text-xl font-bold px-2 py-0.5 rounded hover:bg-gray-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="aspect-video bg-black relative">
              {!isVideoLoaded && (
                <div className="absolute inset-0 bg-gray-900 flex flex-col items-center justify-center text-white z-10 gap-3">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs sm:text-sm font-bold tracking-wide">もうすぐ再生されるよ！待っててね！</p>
                </div>
              )}
              <iframe
                src={`https://www.youtube.com/embed/${data.videoId}?start=${activeItem.seconds}&autoplay=1`}
                title={activeItem.label}
                className="w-full h-full"
                onLoad={() => setIsVideoLoaded(true)}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}