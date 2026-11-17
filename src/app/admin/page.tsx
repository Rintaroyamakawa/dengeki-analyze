'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

type ArchiveItem = {
  videoId: string;
  title: string;
  publishedAt: string | null;
  updatedAt: string;
  timestampCount: number;
  category?: string; // 手動設定用
};

type SyncedVideo = {
  videoId: string;
  title: string;
  publishedAt: string;
};

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
  '🥁 リズム天国 ミラクルスターズ',
  '🗡️ ブレスオブザワイルド',
  '🏹 ティアーズ オブ ザ キングダム',
  '🛡️ 時のオカリナ',
  '⚡ ポケモンBW',
  '✏️ 漢字でGO！',
];

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
  const [newCategoryName, setNewCategoryName] = useState('');
  const [loading, setLoading] = useState(true);

  // 同期・収集用ステート
  const [channelInput, setChannelInput] = useState(DEFAULT_CHANNEL_ID);
  const [uncollectedVideos, setUncollectedVideos] = useState<SyncedVideo[]>([]);
  const [showUncollectedList, setShowUncollectedList] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCollecting, setIsCollecting] = useState(false);
  const [bulkUrls, setBulkUrls] = useState('');
  const [statusText, setStatusText] = useState('準備完了');
  const [noticeMessage, setNoticeMessage] = useState('');

  // ローカル保存済みデータの取得
  const fetchArchives = useCallback(async () => {
    try {
      const res = await fetch('/api/data');
      if (res.ok) {
        const list = await res.json();
        const manualMap = JSON.parse(localStorage.getItem('manual_assignments') || '{}');
        const initialized = list.map((item: ArchiveItem) => ({
          ...item,
          category: manualMap[item.videoId] || '',
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
    const savedCategories = localStorage.getItem('custom_categories');
    if (savedCategories) {
      try {
        setCategories(JSON.parse(savedCategories));
      } catch (e) {
        console.error(e);
      }
    }
    const savedChannel = localStorage.getItem('sync_channel_input');
    if (savedChannel && (savedChannel.startsWith('UC') || savedChannel.startsWith('@'))) {
      setChannelInput(savedChannel);
    }
    fetchArchives();
  }, [fetchArchives]);

  const showNotice = (msg: string) => {
    setNoticeMessage(msg);
    setTimeout(() => setNoticeMessage(''), 3000);
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

    // 🚀 収集完了後に自動でGitHubへプッシュしてサーバーを更新する
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

    // 🚀 個別収集完了後も自動でGitHubへプッシュ
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

  // 新しいカテゴリの追加
  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    if (categories.includes(newCategoryName.trim())) {
      alert('すでに存在する項目です');
      return;
    }
    const updated = [...categories, newCategoryName.trim()];
    setCategories(updated);
    localStorage.setItem('custom_categories', JSON.stringify(updated));
    setNewCategoryName('');
    showNotice('新しい項目を追加しました！');
  };

  // カテゴリ変更
  const handleCategoryChange = (videoId: string, newCat: string) => {
    const updated = archives.map((item) =>
      item.videoId === videoId ? { ...item, category: newCat } : item
    );
    setArchives(updated);

    const manualMap: { [key: string]: string } = {};
    updated.forEach((item) => {
      if (item.category) {
        manualMap[item.videoId] = item.category;
      }
    });
    localStorage.setItem('manual_assignments', JSON.stringify(manualMap));
    showNotice('項目設定を保存しました！');
  };

  return (
    <main className="min-h-screen bg-white text-gray-900 font-sans pb-20">
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-extrabold tracking-tight text-gray-900">
            ローカルデータ収集ダッシュボード
          </h1>
          <Link
            href="/"
            className="text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded transition-colors"
          >
            🏠 サイトに戻る
          </Link>
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

        {/* 3. 新しい項目の追加 */}
        <section className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-extrabold text-gray-800 flex items-center gap-1.5">
            <span>➕</span>
            <span>新しい項目（カテゴリ・シリーズ）の追加</span>
          </h2>
          <form onSubmit={handleAddCategory} className="flex gap-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="例: 🎨 お絵描き配信、💡 新企画 など..."
              className="border border-gray-300 bg-white px-3 py-2 flex-1 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="bg-blue-600 text-white font-bold text-xs px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors shrink-0"
            >
              項目を追加
            </button>
          </form>
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