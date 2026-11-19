'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

type ArchiveItem = {
  videoId: string;
  title: string;
  publishedAt: string | null;
  updatedAt: string;
  timestampCount: number;
  category?: string;
};

type SyncedVideo = {
  videoId: string;
  title: string;
  publishedAt: string;
};

const SERIES_OPTIONS = [
  'マリオシリーズ',
  'ゼルダの伝説シリーズ',
  'ポケモンシリーズ',
  'その他',
] as const;

type SeriesOption = (typeof SERIES_OPTIONS)[number];

const DEFAULT_CHANNEL_ID = '@DengekiNico';

const DEFAULT_CATEGORIES = [
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
  '💫 スーパーマリオ 3Dワールド',
  '🗡️ ブレスオブザワイルド',
  '🏹 ティアーズ オブ ザ キングダム',
  '🛡️ 時のオカリナ',
  '⚡ ポケモンBW',
  '🥁 リズム天国 ミラクルスターズ',
  '✏️ 漢字でGO！',
];

const DEFAULT_SERIES_MAP: Record<string, SeriesOption> = {
  '🍄 スーパーマリオ64': 'マリオシリーズ',
  '☀️ スーパーマリオサンシャイン': 'マリオシリーズ',
  '✨ スーパーマリオギャラクシー２': 'マリオシリーズ',
  '🌟 マリオギャラクシー': 'マリオシリーズ',
  '⭐ スーパーマリオRPG': 'マリオシリーズ',
  '📜 ペーパーマリオRPG': 'マリオシリーズ',
  '💫 スーパーマリオ 3Dワールド': 'マリオシリーズ',
  '🗡️ ブレスオブザワイルド': 'ゼルダの伝説シリーズ',
  '🏹 ティアーズ オブ ザ キングダム': 'ゼルダの伝説シリーズ',
  '🛡️ 時のオカリナ': 'ゼルダの伝説シリーズ',
  '⚡ ポケモンBW': 'ポケモンシリーズ',
  '🎤 歌枠': 'その他',
  '⏳ 耐久配信': 'その他',
  '🎉 記念配信': 'その他',
  '🎧 ASMR': 'その他',
  '🤝 コラボ': 'その他',
  '☕ 雑談': 'その他',
  '🥁 リズム天国 ミラクルスターズ': 'その他',
  '✏️ 漢字でGO！': 'その他',
};

function normalizeCategoryName(name: string): string {
  if (name === '🐈 スーパーマリオ 3Dワールド') {
    return '💫 スーパーマリオ 3Dワールド';
  }
  return name;
}

function normalizeYoutubeUrl(input: string): string {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return `https://www.youtube.com/watch?v=${trimmed}`;
  }
  return trimmed;
}

export default function AdminPage() {
  const [archives, setArchives] = useState<ArchiveItem[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [seriesMap, setSeriesMap] = useState<Record<string, string>>(DEFAULT_SERIES_MAP);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategorySeries, setNewCategorySeries] = useState<SeriesOption>('その他');
  // ✏️ 項目名変更用のステート
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [loading, setLoading] = useState(true);

  // 同期・収集用ステート
  const [channelInput, setChannelInput] = useState(DEFAULT_CHANNEL_ID);
  const [uncollectedVideos, setUncollectedVideos] = useState<SyncedVideo[]>([]);
  const [showUncollectedList, setShowUncollectedList] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCollecting, setIsCollecting] = useState(false);
  // 🔀 GitHub手動更新用ステート
  const [isPushing, setIsPushing] = useState(false);
  const [bulkUrls, setBulkUrls] = useState('');
  const [statusText, setStatusText] = useState('準備完了');
  const [noticeMessage, setNoticeMessage] = useState('');

  const persistConfig = useCallback(
    async (
      nextCategories: string[],
      nextSeriesMap: Record<string, string>,
      nextManualAssignments: Record<string, string>
    ) => {
      localStorage.setItem('custom_categories', JSON.stringify(nextCategories));
      localStorage.setItem('category_series_map', JSON.stringify(nextSeriesMap));
      localStorage.setItem('manual_assignments', JSON.stringify(nextManualAssignments));

      try {
        await fetch('/api/category-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categories: nextCategories,
            seriesMap: nextSeriesMap,
            manualAssignments: nextManualAssignments,
          }),
        });
      } catch (e) {
        console.error('設定ファイル保存エラー:', e);
      }
    },
    []
  );

  const buildManualAssignments = useCallback((list: ArchiveItem[]) => {
    const manualMap: Record<string, string> = {};
    list.forEach((item) => {
      if (item.category) {
        manualMap[item.videoId] = normalizeCategoryName(item.category);
      }
    });
    return manualMap;
  }, []);

  // ローカル保存済みデータの取得
  const fetchArchives = useCallback(async (overrideManualMap?: Record<string, string>) => {
    try {
      const res = await fetch('/api/data');
      if (res.ok) {
        const list = await res.json();
        const manualMap: Record<string, string> =
          overrideManualMap ?? JSON.parse(localStorage.getItem('manual_assignments') || '{}');
        const initialized = list.map((item: ArchiveItem) => ({
          ...item,
          category: normalizeCategoryName(manualMap[item.videoId] || ''),
        }));
        setArchives(initialized);
        return initialized as ArchiveItem[];
      }
    } catch (e) {
      console.error('データ取得エラー:', e);
    } finally {
      setLoading(false);
    }
    return [];
  }, []);

  useEffect(() => {
    const init = async () => {
      let baseCategories = [...DEFAULT_CATEGORIES];
      let baseSeriesMap: Record<string, string> = { ...DEFAULT_SERIES_MAP };
      let baseAssignments: Record<string, string> = {};

      const savedCategories = localStorage.getItem('custom_categories');
      if (savedCategories) {
        try {
          const parsed = JSON.parse(savedCategories);
          if (Array.isArray(parsed)) {
            baseCategories = parsed.map((c: string) => normalizeCategoryName(c));
          }
        } catch (e) {
          console.error(e);
        }
      }

      const savedSeriesMap = localStorage.getItem('category_series_map');
      if (savedSeriesMap) {
        try {
          baseSeriesMap = { ...baseSeriesMap, ...JSON.parse(savedSeriesMap) };
        } catch (e) {
          console.error(e);
        }
      }

      const savedAssignments = localStorage.getItem('manual_assignments');
      if (savedAssignments) {
        try {
          baseAssignments = JSON.parse(savedAssignments);
        } catch (e) {
          console.error(e);
        }
      }

      try {
        const cfgRes = await fetch('/api/category-config');
        if (cfgRes.ok) {
          const serverCfg = await cfgRes.json();
          if (Array.isArray(serverCfg.categories) && serverCfg.categories.length > 0) {
            baseCategories = serverCfg.categories.map((c: string) => normalizeCategoryName(c));
          }
          if (serverCfg.seriesMap && typeof serverCfg.seriesMap === 'object') {
            baseSeriesMap = { ...baseSeriesMap, ...serverCfg.seriesMap };
          }
          if (serverCfg.manualAssignments && typeof serverCfg.manualAssignments === 'object') {
            baseAssignments = { ...baseAssignments, ...serverCfg.manualAssignments };
            localStorage.setItem('manual_assignments', JSON.stringify(baseAssignments));
          }
        }
      } catch (e) {
        console.error(e);
      }

      baseCategories.forEach((cat) => {
        if (!baseSeriesMap[cat]) {
          baseSeriesMap[cat] = 'その他';
        }
      });

      setCategories(baseCategories);
      setSeriesMap(baseSeriesMap);

      const savedChannel = localStorage.getItem('sync_channel_input');
      if (savedChannel && (savedChannel.startsWith('UC') || savedChannel.startsWith('@'))) {
        setChannelInput(savedChannel);
      }
      await fetchArchives(baseAssignments);
    };
    init();
  }, [fetchArchives]);

  const showNotice = (msg: string) => {
    setNoticeMessage(msg);
    setTimeout(() => setNoticeMessage(''), 3000);
  };

  // 🔀 GitHubへ手動プッシュ
  const handleGitPush = async () => {
    setIsPushing(true);
    setStatusText('GitHubへ変更をプッシュ中...');
    try {
      const res = await fetch('/api/git-push', { method: 'POST' });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result.error || 'GitHubへのプッシュに失敗しました');
      }
      setStatusText('GitHubへの更新が完了しました（Vercelの反映をお待ちください）');
      showNotice('GitHubへの更新が完了しました！');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'GitHub更新エラーが発生しました';
      setStatusText(`エラー: ${msg}`);
      showNotice(`GitHub更新に失敗しました: ${msg}`);
    } finally {
      setIsPushing(false);
    }
  };

  // チャンネル同期
  const handleSyncChannel = async () => {
    if (!channelInput.trim()) return;
    setIsSyncing(true);
    setStatusText('チャンネルの配信リストを同期中...');
    localStorage.setItem('sync_channel_input', channelInput.trim());

    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelInput: channelInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '同期に失敗しました');
      }

      const collectedIds = new Set(archives.map((a) => a.videoId));
      const allVideos: SyncedVideo[] = data.videos || [];
      const uncollected = allVideos.filter((v) => !collectedIds.has(v.videoId));

      setUncollectedVideos(uncollected);
      if (uncollected.length > 0) {
        setShowUncollectedList(true);
      }
      setStatusText(`同期完了（全${allVideos.length}件中、未収集 ${uncollected.length}件）`);
      showNotice(`チャンネル同期成功：未収集 ${uncollected.length}件`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '同期エラーが発生しました';
      setStatusText(`エラー: ${msg}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // 単一動画の解析 ＆ 保存
  const analyzeAndSaveVideo = async (videoInput: string, fallbackPublishedAt?: string) => {
    const fullUrl = normalizeYoutubeUrl(videoInput);

    const analyzeRes = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: fullUrl }),
    });
    const analyzedData = await analyzeRes.json();
    if (!analyzeRes.ok) {
      throw new Error(analyzedData.error || '動画の解析に失敗しました');
    }

    const payloadToSave = {
      ...analyzedData,
      publishedAt: analyzedData.publishedAt || fallbackPublishedAt || null,
    };

    const saveRes = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadToSave),
    });
    if (!saveRes.ok) {
      throw new Error('JSONファイルの保存に失敗しました');
    }

    return payloadToSave;
  };

  // 🚀 未収集の配信をすべて一括で自動収集する ＋ 完了後に自動Gitプッシュ
  const handleAutoCollectAll = async () => {
    let targetUncollected = uncollectedVideos;
    if (targetUncollected.length === 0) {
      setStatusText('未収集リストを取得中...');
      setIsCollecting(true);
      try {
        const res = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelInput: channelInput.trim() }),
        });
        const data = await res.json();
        if (res.ok) {
          const collectedIds = new Set(archives.map((a) => a.videoId));
          const allVideos: SyncedVideo[] = data.videos || [];
          targetUncollected = allVideos.filter((v) => !collectedIds.has(v.videoId));
          setUncollectedVideos(targetUncollected);
        }
      } catch (e) {
        console.error(e);
      }
      setIsCollecting(false);
    }

    if (targetUncollected.length === 0) {
      showNotice('新着の未収集配信はありませんでした！（先に「チャンネルを同期する」を押してみてください）');
      return;
    }

    setIsCollecting(true);
    let successCount = 0;
    const total = targetUncollected.length;

    for (let i = 0; i < total; i++) {
      const video = targetUncollected[i];
      setStatusText(`自動収集中 (${i + 1}/${total}): ${video.title}`);
      try {
        await analyzeAndSaveVideo(video.videoId, video.publishedAt);
        successCount++;
      } catch (e) {
        console.error(`${video.videoId} 収集失敗:`, e);
      }
    }

    const updatedList = await fetchArchives();
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelInput: channelInput.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        const collectedIds = new Set(updatedList.map((a) => a.videoId));
        setUncollectedVideos((data.videos || []).filter((v: SyncedVideo) => !collectedIds.has(v.videoId)));
      }
    } catch (e) {
      console.error(e);
    }

    setStatusText(`完了！（${successCount}/${total}件保存完了。GitHubへ自動反映中...）`);
    try {
      const pushRes = await fetch('/api/git-push', { method: 'POST' });
      if (pushRes.ok) {
        showNotice(`${successCount}件の収集 ＆ GitHubへの自動反映が完了しました！`);
      } else {
        console.warn('Git自動プッシュに失敗しました');
        showNotice(`${successCount}件保存しましたが、GitHubへの反映は手動で行ってください。`);
      }
    } catch (pushErr) {
      console.error('Git自動プッシュエラー:', pushErr);
    }

    setIsCollecting(false);
    setStatusText(`完了！（${successCount}/${total}件の保存とGitHub同期が完了）`);
  };

  // 個別URL収集
  const handleCollectBulkUrls = async () => {
    const lines = bulkUrls
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return;

    setIsCollecting(true);
    let successCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      setStatusText(`個別URLを収集中 (${i + 1}/${lines.length}): ${line}`);
      try {
        await analyzeAndSaveVideo(line);
        successCount++;
      } catch (e) {
        console.error(`${line} 収集失敗:`, e);
      }
    }

    setBulkUrls('');
    await fetchArchives();

    setStatusText(`完了！（個別保存完了。GitHubへ自動反映中...）`);
    try {
      await fetch('/api/git-push', { method: 'POST' });
    } catch (e) {
      console.error('Git自動プッシュエラー:', e);
    }

    setIsCollecting(false);
    setStatusText(`完了！（${successCount}/${lines.length}件をJSON保存＆GitHub同期しました）`);
    showNotice(`${successCount}件の個別データを収集・保存しました！`);
  };

  // 新しいカテゴリの追加（シリーズ別分類も同時に保存）
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = normalizeCategoryName(newCategoryName.trim());
    if (!trimmed) return;
    if (categories.includes(trimmed)) {
      alert('すでに存在する項目です');
      return;
    }

    const updatedCategories = [...categories, trimmed];
    const updatedSeriesMap = {
      ...seriesMap,
      [trimmed]: newCategorySeries,
    };

    setCategories(updatedCategories);
    setSeriesMap(updatedSeriesMap);
    await persistConfig(updatedCategories, updatedSeriesMap, buildManualAssignments(archives));

    setNewCategoryName('');
    showNotice(`「${trimmed}」を${newCategorySeries}に追加しました！`);
  };

  // シリーズ別分類の変更
  const handleSeriesChange = async (cat: string, nextSeries: string) => {
    const updatedSeriesMap = {
      ...seriesMap,
      [cat]: nextSeries,
    };
    setSeriesMap(updatedSeriesMap);
    await persistConfig(categories, updatedSeriesMap, buildManualAssignments(archives));
    showNotice(`「${cat}」の分類を「${nextSeries}」に変更しました！`);
  };

  // ✏️ 項目名変更の開始
  const startRenameCategory = (cat: string) => {
    setEditingCategory(cat);
    setEditingCategoryName(cat);
  };

  // ✏️ 項目名の確定（ワンボタンで反映）
  const handleConfirmRenameCategory = async (oldName: string) => {
    const trimmed = normalizeCategoryName(editingCategoryName.trim());
    if (!trimmed) {
      alert('項目名を入力してください');
      return;
    }
    if (trimmed === oldName) {
      setEditingCategory(null);
      return;
    }
    if (categories.includes(trimmed)) {
      alert('すでに存在する項目名です');
      return;
    }

    const updatedCategories = categories.map((c) => (c === oldName ? trimmed : c));
    const currentSeries = seriesMap[oldName] || 'その他';
    const updatedSeriesMap: Record<string, string> = { ...seriesMap, [trimmed]: currentSeries };
    delete updatedSeriesMap[oldName];

    const updatedArchives = archives.map((item) =>
      item.category === oldName ? { ...item, category: trimmed } : item
    );

    setCategories(updatedCategories);
    setSeriesMap(updatedSeriesMap);
    setArchives(updatedArchives);
    await persistConfig(updatedCategories, updatedSeriesMap, buildManualAssignments(updatedArchives));

    setEditingCategory(null);
    setEditingCategoryName('');
    showNotice(`「${oldName}」を「${trimmed}」に変更しました！`);
  };

  // 🗑️ 項目の削除
  const handleDeleteCategory = async (targetCat: string) => {
    if (!confirm(`項目「${targetCat}」を削除しますか？（この項目が手動設定されていた配信は未設定に戻ります）`)) {
      return;
    }

    const updatedCategories = categories.filter((c) => c !== targetCat);
    const updatedSeriesMap: Record<string, string> = { ...seriesMap };
    delete updatedSeriesMap[targetCat];

    if (editingCategory === targetCat) {
      setEditingCategory(null);
      setEditingCategoryName('');
    }

    const updatedArchives = archives.map((item) =>
      item.category === targetCat ? { ...item, category: '' } : item
    );

    setCategories(updatedCategories);
    setSeriesMap(updatedSeriesMap);
    setArchives(updatedArchives);
    await persistConfig(updatedCategories, updatedSeriesMap, buildManualAssignments(updatedArchives));

    showNotice(`項目「${targetCat}」を削除しました！`);
  };

  // カテゴリ変更
  const handleCategoryChange = async (videoId: string, newCat: string) => {
    const updated = archives.map((item) =>
      item.videoId === videoId ? { ...item, category: newCat } : item
    );
    setArchives(updated);
    await persistConfig(categories, seriesMap, buildManualAssignments(updated));
    showNotice('項目設定を保存しました！');
  };

  return (
    <main className="min-h-screen bg-white text-gray-900 font-sans pb-20">
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-extrabold tracking-tight text-gray-900">
            ローカルデータ収集ダッシュボード
          </h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleGitPush}
              disabled={isPushing || isSyncing || isCollecting}
              className="text-xs font-bold bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white px-3 py-1.5 rounded transition-colors cursor-pointer"
            >
              {isPushing ? 'GitHub更新中...' : '🐙 GitHub更新'}
            </button>
            <Link
              href="/"
              className="text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded transition-colors"
            >
              🏠 サイトに戻る
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 pt-6 space-y-8">
        {noticeMessage && (
          <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg text-sm font-bold">
            ✨ {noticeMessage}
          </div>
        )}

        {/* 1. YouTubeチャンネル自動同期センター */}
        <section className="bg-blue-50/70 border border-blue-200 rounded-xl p-5 space-y-3">
          <div className="space-y-1">
            <h2 className="text-sm font-extrabold text-blue-950">
              YouTubeチャンネル自動同期センター
            </h2>
            <p className="text-xs text-blue-800">
              1. チャンネルIDで同期して全配信をリストに登録し、2. 未収集の配信を一括で自動取得できます。
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={channelInput}
              onChange={(e) => setChannelInput(e.target.value)}
              disabled={isSyncing || isCollecting}
              placeholder="チャンネルID (UC...) または @ハンドル"
              className="border border-blue-300 bg-white px-3 py-2 flex-1 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={handleSyncChannel}
              disabled={isSyncing || isCollecting || !channelInput.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold text-xs px-5 py-2.5 rounded-lg transition-colors shrink-0"
            >
              {isSyncing ? '同期中...' : 'チャンネルを同期する'}
            </button>
          </div>

          <button
            type="button"
            onClick={handleAutoCollectAll}
            disabled={isCollecting || isSyncing || !channelInput.trim()}
            className="w-full py-2.5 rounded-lg font-bold text-xs text-white transition-colors bg-purple-600 hover:bg-purple-700 shadow-sm disabled:bg-gray-400"
          >
            🚀 未収集の配信 ({uncollectedVideos.length}件) をすべて一括で自動収集する
          </button>

          {/* 未収集リストのアコーディオン */}
          {uncollectedVideos.length > 0 && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowUncollectedList((prev) => !prev)}
                className="w-full flex items-center justify-between bg-white hover:bg-blue-50 border border-blue-200 text-blue-900 font-bold text-xs px-3.5 py-2 rounded-lg transition-colors"
              >
                <span>📋 未収集の配信一覧を確認する（{uncollectedVideos.length}件）</span>
                <span>{showUncollectedList ? '▲ 閉じる' : '▼ 開く'}</span>
              </button>

              {showUncollectedList && (
                <div className="mt-2 bg-white border border-blue-200 rounded-lg max-h-80 overflow-y-auto divide-y divide-gray-100">
                  {uncollectedVideos.map((video, index) => (
                    <div
                      key={video.videoId}
                      className="p-2.5 flex items-center justify-between gap-3 hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="text-[11px] font-mono text-gray-400 w-6 text-right shrink-0">
                          {index + 1}.
                        </span>
                        <img
                          src={`https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`}
                          alt={video.title}
                          className="w-20 aspect-video object-cover rounded shrink-0 bg-gray-900"
                        />
                        <div className="min-w-0 flex-1">
                          <a
                            href={`https://www.youtube.com/watch?v=${video.videoId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-bold text-gray-800 hover:text-blue-600 line-clamp-1 block"
                          >
                            {video.title}
                          </a>
                          <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5 font-mono">
                            <span>
                              投稿・配信日時:{' '}
                              {video.publishedAt
                                ? new Date(video.publishedAt).toLocaleString('ja-JP', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '不明'}
                            </span>
                            <span className="text-gray-400">ID: {video.videoId}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* 2. 個別URL収集 */}
        <section className="space-y-2.5">
          <label className="block text-xs font-extrabold text-gray-800">
            個別収集したい配信のURL（1行に1つ）
          </label>
          <textarea
            rows={4}
            value={bulkUrls}
            onChange={(e) => setBulkUrls(e.target.value)}
            disabled={isCollecting}
            placeholder="https://www.youtube.com/watch?v=xxxxx"
            className="w-full border border-gray-300 rounded-lg p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={handleCollectBulkUrls}
              disabled={isCollecting || !bulkUrls.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-bold text-xs px-5 py-2.5 rounded-lg transition-colors"
            >
              選択したURLのデータを収集する
            </button>
            <span className="text-xs font-bold text-gray-600">
              ステータス: {statusText}
            </span>
          </div>
        </section>

        {/* 3. 項目の追加・シリーズ別分類・名前変更・削除 */}
        <section className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-extrabold text-gray-800 flex items-center gap-1.5">
              <span>➕</span>
              <span>項目（カテゴリ・シリーズ）の管理</span>
            </h2>
            <p className="text-xs text-gray-500">
              追加・変更した項目とシリーズ分類は設定ファイルに保存されます。「🐙 GitHub更新」を押すと公開版にも反映されます。
            </p>
          </div>

          <form onSubmit={handleAddCategory} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="例: 🎨 お絵描き配信、💡 新企画 など..."
              className="border border-gray-300 bg-white px-3 py-2 flex-1 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={newCategorySeries}
              onChange={(e) => setNewCategorySeries(e.target.value as SeriesOption)}
              className="border border-gray-300 bg-white px-3 py-2 rounded-lg text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
            >
              {SERIES_OPTIONS.map((series) => (
                <option key={series} value={series}>
                  {series}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="bg-blue-600 text-white font-bold text-xs px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors shrink-0 cursor-pointer"
            >
              項目を追加
            </button>
          </form>

          <div className="space-y-2 pt-1">
            <div className="text-xs font-bold text-gray-500">
              登録済み項目一覧（{categories.length}件）— シリーズ変更・名前変更・削除が可能
            </div>
            <div className="grid grid-cols-1 gap-2">
              {categories.map((cat) => {
                const isEditing = editingCategory === cat;
                const currentSeries = seriesMap[cat] || 'その他';
                return (
                  <div
                    key={cat}
                    className="bg-white border border-gray-200 rounded-lg px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <input
                          type="text"
                          value={editingCategoryName}
                          onChange={(e) => setEditingCategoryName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleConfirmRenameCategory(cat);
                            } else if (e.key === 'Escape') {
                              setEditingCategory(null);
                            }
                          }}
                          autoFocus
                          className="border border-blue-400 rounded px-2 py-1 text-xs font-bold flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleConfirmRenameCategory(cat)}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-2.5 py-1 rounded shrink-0 cursor-pointer"
                        >
                          確定
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCategory(null)}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-[11px] font-bold px-2 py-1 rounded shrink-0 cursor-pointer"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-xs font-bold text-gray-800 truncate">{cat}</span>
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <select
                            aria-label={`${cat} のシリーズ別分類`}
                            value={currentSeries}
                            onChange={(e) => handleSeriesChange(cat, e.target.value)}
                            className="border border-gray-300 bg-gray-50 hover:bg-white px-2 py-1 rounded text-[11px] font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                          >
                            {SERIES_OPTIONS.map((series) => (
                              <option key={series} value={series}>
                                {series}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => startRenameCategory(cat)}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold px-2 py-1 rounded transition-colors cursor-pointer"
                          >
                            ✏️ 名前変更
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat)}
                            className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-[11px] font-bold px-2 py-1 rounded transition-colors cursor-pointer"
                          >
                            🗑️ 削除
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 4. ローカル保存済みデータ一覧 */}
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-extrabold text-gray-900">
              ローカル保存済みデータ一覧（{archives.length}件）
            </h2>
            <p className="text-xs text-gray-500">
              dataフォルダに実ファイルとして保存されているデータです。プルダウンから表示項目（カテゴリ）を個別に変更できます。
            </p>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">読み込み中...</div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden divide-y">
              {archives.map((item) => (
                <div
                  key={item.videoId}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <img
                      src={`https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`}
                      alt={item.title}
                      className="w-24 aspect-video object-cover rounded shrink-0 bg-gray-900"
                    />
                    <div className="space-y-1 min-w-0">
                      <h3 className="text-xs font-bold text-gray-800 line-clamp-2">
                        {item.title}
                      </h3>
                      <div className="flex items-center gap-3 text-[10px] text-gray-400 font-mono">
                        <span>ID: {item.videoId}</span>
                        {item.updatedAt && (
                          <span>更新: {new Date(item.updatedAt).toLocaleString('ja-JP')}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-500 font-bold">項目:</span>
                    <select
                      value={item.category || ''}
                      onChange={(e) => handleCategoryChange(item.videoId, e.target.value)}
                      className="border border-gray-300 bg-white px-3 py-1.5 rounded-lg text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">（自動判定に任せる）</option>
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}