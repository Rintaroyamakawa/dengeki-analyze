'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
    return '🐈 スーパーマリオ 3Dワールド';
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

export default function Home() {
  const [archives, setArchives] = useState<ArchiveItem[]>([]);
  const [categories, setCategories] = useState<string[]>(CATEGORIES);
  const [manualAssignments, setManualAssignments] = useState<Record<string, string>>({});
  const [loadingArchives, setLoadingArchives] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [isLocal, setIsLocal] = useState(false);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>('読込中...');

  const [myBookmarks, setMyBookmarks] = useState<MyBookmark[]>([]);
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<string[]>([]);

  const [url, setUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [activeArchiveTitle, setActiveArchiveTitle] = useState<string>('');
  const [data, setData] = useState<{
    videoId: string;
    title: string;
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
        return manualAssignments[cleanId];
      }
      if (MANUAL_CATEGORY[cleanId]) {
        return MANUAL_CATEGORY[cleanId];
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
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
            const merged = Array.from(new Set([...CATEGORIES, ...parsed]));
            setCategories(merged);
          }
        } catch (e) {
          console.error('カテゴリの読み込みに失敗しました:', e);
        }
      }

      const savedAssignments = localStorage.getItem('manual_assignments');
      if (savedAssignments) {
        try {
          setManualAssignments(JSON.parse(savedAssignments));
        } catch (e) {
          console.error('手動割り当ての読み込みに失敗しました:', e);
        }
      }
    }

    const fetchArchives = async () => {
      try {
        const res = await fetch('/api/data');
        if (res.ok) {
          const list = await res.json();
          setArchives(list);
          setLastUpdatedTime(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        }
      } catch (e) {
        console.error('アーカイブ一覧の取得に失敗しました:', e);
      } finally {
        setLoadingArchives(false);
      }
    };
    fetchArchives();
  }, []);

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

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.videoId.toLowerCase().includes(q)
      );
    }

    if (selectedCategory !== 'all' && selectedCategory !== 'bookmarks') {
      result = result.filter((item) => getCategory(item) === selectedCategory);
    }

    result.sort((a, b) => {
      const dateA = new Date(a.publishedAt || a.updatedAt || 0).getTime();
      const dateB = new Date(b.publishedAt || b.updatedAt || 0).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [archives, searchQuery, selectedCategory, sortOrder, getCategory]);

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

  const runAnalyze = async (targetUrl: string, presetTitle?: string) => {
    setUrl(targetUrl);
    setAnalyzing(true);
    setError('');
    setData(null);
    setActiveItem(null);
    if (presetTitle) {
      setActiveArchiveTitle(presetTitle);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'エラーが発生しました');
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyzeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    runAnalyze(url);
  };

  const handleSelectArchive = async (videoId: string, title?: string) => {
    setAnalyzing(true);
    setError('');
    setData(null);
    setActiveItem(null);
    if (title) {
      setActiveArchiveTitle(title);
    }
    setUrl(`https://www.youtube.com/watch?v=${videoId}`);
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
            <span className="opacity-0 group-hover:opacity-100 bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow transition-opacity">
              📊 見どころを解析
            </span>
          </div>
        </div>

        <div className="p-3 flex-1 flex flex-col justify-between">
          <h3 className="text-xs font-bold text-gray-800 line-clamp-2 group-hover:text-blue-600 transition-colors leading-relaxed">
            {item.title}
          </h3>
          <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400 font-mono">
            <span>ID: {item.videoId}</span>
            <a
              href={`https://www.youtube.com/watch?v=${item.videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-gray-400 hover:text-red-500 underline"
            >
              YouTubeで開く ↗
            </a>
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 font-sans pb-16">
      <header className="bg-white border-b sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <h1 className="text-lg font-extrabold tracking-tight text-gray-900">
              電撃ニコ 見どころアーカイブ解析所
            </h1>
            <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-0.5 rounded-full">
              {archives.length}件収録
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-gray-400">
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

      <div className="max-w-5xl mx-auto px-4 pt-6 space-y-8">
        {/* 🔍 見どころ解析パネル */}
        <section className="bg-white border rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5">
            <span>📊</span>
            <span>配信の見どころ・チャット熱量を解析する</span>
          </h2>

          <form onSubmit={handleAnalyzeSubmit} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="下のリストから選ぶか、配信URLを直接貼り付け..."
              className="border border-gray-300 p-2.5 flex-1 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <button
              type="submit"
              disabled={analyzing}
              className="bg-blue-600 text-white font-bold text-sm px-6 py-2.5 rounded-lg disabled:opacity-50 hover:bg-blue-700 transition-colors shrink-0"
            >
              {analyzing ? '解析中...' : '解析する'}
            </button>
          </form>

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm font-bold">
              ⚠️ {error}
            </div>
          )}

          {analyzing && (
            <div className="mt-6 py-8 flex flex-col items-center justify-center text-gray-500 gap-2">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm font-bold">コメントとチャット欄から見どころを集計中...</p>
            </div>
          )}

          {(data || analyzing) && (
            <div className="mt-6 pt-6 border-t space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-lg text-gray-900">
                    {data?.title ||
                     activeArchiveTitle ||
                     (url ? archives.find(a => url.includes(a.videoId))?.title : null) ||
                     (analyzing ? '配信情報を読み込み中...' : 'タイトル不明')}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {data ? (
                      (() => {
                        const effectiveDuration = data.duration > 0
                          ? data.duration
                          : (data.heatmapData && data.heatmapData.length > 0
                              ? data.heatmapData[data.heatmapData.length - 1].minute * 60
                              : 0);
                        const hours = Math.floor(effectiveDuration / 3600);
                        const mins = Math.floor((effectiveDuration % 3600) / 60);
                        return (
                          <>
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
                  className="text-xs text-gray-400 hover:text-gray-600 self-start sm:self-center"
                >
                  ✕ 解析結果を閉じる
                </button>
              </div>

              {data && optimizedHeatmap.length > 0 && (
                <div className="bg-gray-50 border rounded-lg p-4">
                  <h4 className="text-xs font-bold text-gray-700 mb-2 flex items-center justify-between">
                    <span>🔥 チャット熱量ヒートマップ（配信全体の盛り上がり分布）</span>
                    <span className="text-[11px] text-gray-400 font-normal">バーをクリックするとその時間にジャンプ</span>
                  </h4>

                  <div className="h-28 flex items-end gap-[1px] bg-white border-b border-x p-1 rounded">
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
                  <div className="flex justify-between text-[11px] text-gray-400 mt-1 px-1">
                    <span>0:00 (開始)</span>
                    <span>{optimizedHeatmap[Math.floor(optimizedHeatmap.length / 2)]?.timeLabel || ''}</span>
                    <span>{optimizedHeatmap[optimizedHeatmap.length - 1]?.timeLabel || ''} (終了)</span>
                  </div>
                </div>
              )}

              {/* タイムスタンプ一覧 */}
              {data && (
                <div className="border rounded-lg divide-y bg-white max-h-[380px] overflow-y-auto">
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
                          className="p-3 flex items-center gap-3 text-sm hover:bg-blue-50 transition-colors"
                        >
                          <span
                            onClick={() => handleOpenModal(item)}
                            className="font-mono font-bold text-blue-600 w-16 shrink-0 cursor-pointer hover:underline"
                          >
                            {item.time}
                          </span>
                          <span
                            onClick={() => handleOpenModal(item)}
                            className="flex-1 flex flex-wrap items-center gap-2 cursor-pointer"
                          >
                            <span>{item.label}</span>
                            {count > 1 && (
                              <span className="bg-orange-100 text-orange-700 text-xs px-2.5 py-0.5 rounded-full font-bold shrink-0">
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

        {/* 📚 保存済みアーカイブ一覧セクション */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-base font-extrabold text-gray-800 flex items-center gap-2">
              <span>🎬</span>
              <span>{selectedCategory === 'bookmarks' ? '⭐ マイ切り抜きポイント一覧' : 'アーカイブ一覧'}</span>
              <span className="text-xs font-normal text-gray-500">
                {selectedCategory === 'bookmarks' ? `${myBookmarks.length}件保存中` : `${filteredArchives.length}件表示中`}
              </span>
            </h2>

            {selectedCategory !== 'bookmarks' && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="タイトルやゲーム名で検索..."
                  className="border border-gray-300 bg-white px-3 py-1.5 rounded-lg text-sm w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as any)}
                  className="border border-gray-300 bg-white px-2.5 py-1.5 rounded-lg text-xs font-bold text-gray-700 shrink-0"
                >
                  <option value="newest">新しい順</option>
                  <option value="oldest">古い順</option>
                </select>
              </div>
            )}
          </div>

          {/* 🎯 カテゴリ目次 */}
          <div className="bg-white border rounded-xl p-3 shadow-sm space-y-2">
            <div className="text-xs font-bold text-gray-500 flex items-center justify-between">
              <span>📂 カテゴリ・シリーズで絞り込み（クリックで選択）</span>
              {selectedCategory !== 'all' && (
                <button
                  onClick={() => setSelectedCategory('all')}
                  className="text-blue-600 hover:underline text-xs"
                >
                  ✕ 絞り込みを解除
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`text-xs font-bold px-3 py-1.5 rounded-full transition-all ${
                  selectedCategory === 'all'
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                すべて ({archives.length})
              </button>

              <button
                onClick={() => setSelectedCategory('bookmarks')}
                className={`text-xs font-bold px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
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

              {categories.map((cat) => {
                const count = archives.filter(item => getCategory(item) === cat).length;
                if (count === 0) return null;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-full transition-all ${
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

          {selectedCategory === 'bookmarks' && myBookmarks.length > 0 && (
            <div className="bg-white border rounded-xl p-3 shadow-sm flex items-center justify-between text-xs">
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
                className="bg-red-50 hover:bg-red-100 text-red-600 font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
              >
                🗑️ 選択した項目を一括削除 ({selectedBookmarkIds.length}件)
              </button>
            </div>
          )}

          {selectedCategory === 'bookmarks' ? (
            myBookmarks.length === 0 ? (
              <div className="bg-white border rounded-xl p-12 text-center text-gray-500 text-sm space-y-2">
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
                      className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                        isChecked ? 'bg-blue-50/40' : 'hover:bg-amber-50/50'
                      }`}
                    >
                      <div className="flex items-start sm:items-center gap-3 flex-1">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectBookmark(clip.id)}
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer mt-1 sm:mt-0 shrink-0"
                        />

                        <img
                          src={`https://i.ytimg.com/vi/${clip.videoId}/mqdefault.jpg`}
                          alt={clip.videoTitle}
                          className="w-28 aspect-video object-cover rounded shrink-0 bg-gray-900 cursor-pointer"
                          onClick={() => handleSelectArchive(clip.videoId, clip.videoTitle)}
                        />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
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
                            <span className="text-[10px] text-gray-400">{clip.createdAt} 追加</span>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredArchives.map((item) => renderArchiveCard(item))}
            </div>
          )}
        </section>
      </div>

      {/* 🎬 ポップアップ小窓レイヤー */}
      {activeItem && data && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-xl overflow-hidden animate-fadeIn">
            <div className="flex justify-between items-center bg-gray-900 text-white px-4 py-3">
              <div className="flex items-center gap-2 truncate">
                <span className="font-mono text-blue-400 font-bold">{activeItem.time}</span>
                <span className="text-sm truncate">{activeItem.label}</span>
              </div>
              <button
                onClick={() => setActiveItem(null)}
                className="text-gray-400 hover:text-white text-xl font-bold px-2 py-0.5 rounded hover:bg-gray-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="aspect-video bg-black relative">
              {!isVideoLoaded && (
                <div className="absolute inset-0 bg-gray-900 flex flex-col items-center justify-center text-white z-10 gap-3">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm font-bold tracking-wide">もうすぐ再生されるよ！待っててね！</p>
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