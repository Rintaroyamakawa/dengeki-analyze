'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

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

export default function Home() {
  const [archives, setArchives] = useState<ArchiveItem[]>([]);
  const [loadingArchives, setLoadingArchives] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'title'>('newest');

  const [url, setUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
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

  useEffect(() => {
    const fetchArchives = async () => {
      try {
        const res = await fetch('/api/data');
        if (res.ok) {
          const list = await res.json();
          setArchives(list);
        }
      } catch (e) {
        console.error('アーカイブ一覧の取得に失敗しました:', e);
      } finally {
        setLoadingArchives(false);
      }
    };
    fetchArchives();
  }, []);

  const filteredArchives = useMemo(() => {
    let result = [...archives];
    
    // 検索フィルタ
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.videoId.toLowerCase().includes(q)
      );
    }

    // ソート処理（新しい順だけを反転）
    if (sortOrder === 'newest') {
      result.sort((a, b) => {
        const dateA = new Date(a.publishedAt || a.updatedAt || 0).getTime();
        const dateB = new Date(b.publishedAt || b.updatedAt || 0).getTime();
        return dateA - dateB; // 新しい順の向きを反転
      });
    } else if (sortOrder === 'oldest') {
      result.sort((a, b) => {
        const dateA = new Date(a.publishedAt || a.updatedAt || 0).getTime();
        const dateB = new Date(b.publishedAt || b.updatedAt || 0).getTime();
        return dateB - dateA; // 古い順
      });
    } else if (sortOrder === 'title') {
      result.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
    }

    return result;
  }, [archives, searchQuery, sortOrder]);

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

  const runAnalyze = async (targetUrl: string) => {
    setUrl(targetUrl);
    setAnalyzing(true);
    setError('');
    setData(null);
    setActiveItem(null);

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

  const handleSelectArchive = (videoId: string) => {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    runAnalyze(watchUrl);
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

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 font-sans pb-16">
      {/* ヘッダー */}
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
          <Link
            href="/admin"
            className="text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded transition-colors"
          >
            ⚙️ データ管理 (/admin)
          </Link>
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

          {data && !analyzing && (
            <div className="mt-6 pt-6 border-t space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-lg text-gray-900">{data.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    総時間: {Math.floor(data.duration / 3600)}時間{Math.floor((data.duration % 3600) / 60)}分 ／ 抽出タイムスタンプ: <span className="font-bold text-blue-600">{data.timestamps.length}件</span>
                  </p>
                </div>
                <button
                  onClick={() => setData(null)}
                  className="text-xs text-gray-400 hover:text-gray-600 self-start sm:self-center"
                >
                  ✕ 解析結果を閉じる
                </button>
              </div>

              {/* 📊 ヒートマップ */}
              {optimizedHeatmap.length > 0 && (
                <div className="bg-gray-50 border rounded-lg p-4">
                  <h4 className="text-xs font-bold text-gray-700 mb-2 flex items-center justify-between">
                    <span>🔥 チャット熱量ヒートマップ（配信全体の盛り上がり分布）</span>
                    <span className="text-[11px] text-gray-400 font-normal">バーをクリックするとその時間にジャンプ</span>
                  </h4>
                  <p className="text-[11px] text-gray-500 mb-2">
                    ※アーカイブ動画のコメント欄やタイムスタンプをもとに、コメントの集中度を集計しています。
                  </p>
                  
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
              <div className="border rounded-lg divide-y bg-white max-h-[380px] overflow-y-auto">
                {data.timestamps.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500">タイムスタンプが見つかりませんでした</p>
                ) : (
                  data.timestamps.map((item, idx) => {
                    const authorName = item.authors?.[0] || '視聴者';
                    const count = item.count || 1;
                    const otherCount = count - 1;

                    return (
                      <div
                        key={idx}
                        onClick={() => handleOpenModal(item)}
                        className="p-3 flex items-center gap-3 text-sm hover:bg-blue-50 cursor-pointer transition-colors"
                      >
                        <span className="font-mono font-bold text-blue-600 w-16 shrink-0">
                          {item.time}
                        </span>
                        <span className="flex-1 flex flex-wrap items-center gap-2">
                          <span>{item.label}</span>
                          {count > 1 && (
                            <span className="bg-orange-100 text-orange-700 text-xs px-2.5 py-0.5 rounded-full font-bold shrink-0">
                              🔥 {count}人がタイムスタンプに設定してます！
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-gray-400 shrink-0 hidden sm:inline">
                          [{item.source}: {authorName} {otherCount > 0 ? `他${otherCount}人` : ''}]
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </section>

        {/* 📚 保存済みアーカイブ一覧セクション */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-base font-extrabold text-gray-800 flex items-center gap-2">
              <span>🎬</span>
              <span>アーカイブ一覧（クリックで即解析）</span>
              <span className="text-xs font-normal text-gray-500">
                {filteredArchives.length}件表示中
              </span>
            </h2>

            {/* 検索＆ソートコントロール */}
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
                className="border border-gray-300 bg-white px-2.5 py-1.5 rounded-lg text-xs font-bold text-gray-700"
              >
                <option value="newest">新しい順</option>
                <option value="oldest">古い順</option>
                <option value="title">タイトル順</option>
              </select>
            </div>
          </div>

          {loadingArchives ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              アーカイブを読み込み中...
            </div>
          ) : filteredArchives.length === 0 ? (
            <div className="bg-white border rounded-xl p-8 text-center text-gray-500 text-sm">
              該当するアーカイブが見つかりませんでした。
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredArchives.map((item) => {
                const isSelected = data?.videoId === item.videoId;
                return (
                  <div
                    key={item.videoId}
                    onClick={() => handleSelectArchive(item.videoId)}
                    className={`group bg-white border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col ${
                      isSelected ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-blue-300'
                    }`}
                  >
                    {/* YouTubeサムネイル */}
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

                    {/* タイトル＆ID */}
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
              })}
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