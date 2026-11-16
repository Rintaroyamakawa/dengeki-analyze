'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

type SavedItem = {
  videoId: string;
  title?: string;
  publishedAt?: string;
  updatedAt: string;
};

type MasterArchive = {
  videoId: string;
  title: string;
};

export default function AdminDashboard() {
  const [urlInput, setUrlInput] = useState('');
  const [channelInput, setChannelInput] = useState('UCoal0OX6-5TCEVRApZjj5-Q'); // 電撃ニコのチャンネルIDを初期値に設定！
  const [savedList, setSavedList] = useState<SavedItem[]>([]);
  const [masterArchives, setMasterArchives] = useState<MasterArchive[]>([]);
  const [newTitleInput, setNewTitleInput] = useState('');
  const [newUrlInput, setNewUrlInput] = useState('');
  const [statusText, setStatusText] = useState('準備完了');
  const [isProcessing, setIsProcessing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // どんなYouTubeのURL形式（/live/, watch?v=, youtu.beなど）でも確実に11桁のIDを切り出す関数
  const extractVideoId = (input: string) => {
    const trimmed = input.trim();
    if (/^[0-9A-Za-z_-]{11}$/.test(trimmed)) return trimmed;
    try {
      const url = new URL(trimmed);
      if (url.hostname === 'youtu.be') {
        return url.pathname.slice(1, 12);
      }
      if (url.hostname.includes('youtube.com')) {
        const v = url.searchParams.get('v');
        if (v) return v;
        const parts = url.pathname.split('/');
        const idx = parts.findIndex(p => p === 'live' || p === 'embed' || p === 'v');
        if (idx !== -1 && parts[idx + 1]) {
          return parts[idx + 1].slice(0, 11);
        }
      }
    } catch (e) {
      // URL形式でない場合のフォールバック
    }
    const match = trimmed.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
    return match ? match[1] : trimmed;
  };

  const fetchSavedList = async () => {
    const res = await fetch('/api/data');
    const data = await res.json();
    if (Array.isArray(data)) {
      setSavedList(data);
    }
  };

  useEffect(() => {
    fetchSavedList();
    const savedMaster = localStorage.getItem('dengekiniko_master_archives');
    if (savedMaster) {
      try {
        setMasterArchives(JSON.parse(savedMaster));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const saveMasterToStorage = (newList: MasterArchive[]) => {
    setMasterArchives(newList);
    localStorage.setItem('dengekiniko_master_archives', JSON.stringify(newList));
  };

  // YouTubeチャンネルの全配信をAPIで一括同期する
  const handleSyncChannel = async () => {
    if (!channelInput.trim()) {
      alert('チャンネルIDを入力してください');
      return;
    }

    setIsProcessing(true);
    setStatusText('YouTubeからチャンネルの全配信を同期中...');

    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelInput: channelInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '同期に失敗しました');

      const currentMaster = [...masterArchives];
      let addedCount = 0;

      for (const v of data.videos) {
        if (!currentMaster.some(m => m.videoId === v.videoId)) {
          currentMaster.push({ videoId: v.videoId, title: v.title });
          addedCount++;
        }
      }

      saveMasterToStorage(currentMaster);
      setStatusText(`同期完了！ 新規に ${addedCount}件 のアーカイブをリストに追加しました。`);
    } catch (err: any) {
      console.error(err);
      setStatusText(`エラー: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const savedVideoIds = new Set(savedList.map(item => item.videoId));
  const uncollectedCount = masterArchives.filter(m => !savedVideoIds.has(m.videoId)).length;

  // 未収集のアーカイブを一括で自動収集する
  const handleBatchCollectUncollected = async () => {
    const uncollected = masterArchives.filter(m => !savedVideoIds.has(m.videoId));
    if (uncollected.length === 0) {
      alert('未収集の配信はありません！すべて収集済みです。');
      return;
    }

    if (!confirm(`未収集の配信 ${uncollected.length}件 の一括自動収集を開始しますか？`)) {
      return;
    }

    setIsProcessing(true);
    abortControllerRef.current = new AbortController();

    for (let i = 0; i < uncollected.length; i++) {
      if (abortControllerRef.current?.signal.aborted) {
        setStatusText('一括収集を中断しました');
        break;
      }

      const target = uncollected[i];
      setStatusText(`一括収集中 (${i + 1}/${uncollected.length}): ${target.title}`);

      try {
        const res = await fetch('/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            videoId: target.videoId, 
            data: { videoId: target.videoId, title: target.title, heatmap: [] } 
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!res.ok) throw new Error('保存に失敗しました');
      } catch (err: any) {
        if (err.name === 'AbortError') break;
        console.error(err);
      }
    }

    setIsProcessing(false);
    setStatusText('一括収集が完了しました！');
    fetchSavedList();
  };

  const handleStartCollection = async () => {
    const rawLines = urlInput.split('\n').map(u => u.trim()).filter(Boolean);
    if (rawLines.length === 0) {
      alert('配信のURLまたは動画IDを入力してください');
      return;
    }

    setIsProcessing(true);
    abortControllerRef.current = new AbortController();
    const currentMaster = [...masterArchives];

    for (let i = 0; i < rawLines.length; i++) {
      if (abortControllerRef.current?.signal.aborted) {
        setStatusText('中断しました');
        break;
      }

      const targetUrl = rawLines[i];
      const videoId = extractVideoId(targetUrl);

      if (!videoId || videoId.length !== 11) {
        setStatusText(`エラー: 有効な動画IDが取得できませんでした (${targetUrl})`);
        continue;
      }

      setStatusText(`収集中 (${i + 1}/${rawLines.length}): ${videoId}`);

      try {
        const res = await fetch('/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId, data: { videoId, heatmap: [] } }),
          signal: abortControllerRef.current.signal,
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || '保存に失敗しました');
        }

        const resultJson = await res.json();
        const fetchedTitle = resultJson.title || `配信 #${videoId}`;

        if (!currentMaster.some(m => m.videoId === videoId)) {
          currentMaster.push({ videoId, title: fetchedTitle });
        }
      } catch (err: any) {
        if (err.name === 'AbortError') break;
        console.error(err);
        setStatusText(`エラー: ${err.message}`);
      }
    }

    saveMasterToStorage(currentMaster);
    setIsProcessing(false);
    setStatusText('完了しました！');
    setUrlInput('');
    fetchSavedList();
  };

  const handleAbort = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setIsProcessing(false);
  };

  const handleAddManual = (e: React.FormEvent) => {
    e.preventDefault();
    const videoId = extractVideoId(newUrlInput);

    if (!videoId || videoId.length !== 11) {
      alert('正しいYouTubeのURLか動画IDを入力してください');
      return;
    }

    if (masterArchives.some(m => m.videoId === videoId)) {
      alert('すでにこの配信はリストに登録されています');
      return;
    }

    const newList = [...masterArchives, { videoId, title: newTitleInput.trim() || `配信 #${videoId}` }];
    saveMasterToStorage(newList);
    setNewUrlInput('');
    setNewTitleInput('');
  };

  const handleDeleteMaster = (videoId: string) => {
    if (confirm('この配信を管理リストから削除しますか？')) {
      const newList = masterArchives.filter(m => m.videoId !== videoId);
      saveMasterToStorage(newList);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto font-sans">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">ローカルデータ収集ダッシュボード</h1>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700"
        >
          <span>⚡</span>
          <span>ニコすこ！に戻る</span>
        </Link>
      </div>

      {/* チャンネル自動同期 ＆ 一括収集センター */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
        <label className="block text-sm font-semibold mb-1 text-blue-900">
          YouTubeチャンネル自動同期センター
        </label>
        <p className="text-xs text-blue-700 mb-3">
          1. チャンネルIDで同期して全配信をリストに登録し、2. 未収集の配信を一括で自動取得できます。
        </p>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            className="flex-1 p-2 border rounded text-sm bg-white font-mono"
            value={channelInput}
            onChange={(e) => setChannelInput(e.target.value)}
            disabled={isProcessing}
          />
          <button
            onClick={handleSyncChannel}
            disabled={isProcessing}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            チャンネルを同期する
          </button>
        </div>

        <div>
          <button
            onClick={handleBatchCollectUncollected}
            disabled={isProcessing || uncollectedCount === 0}
            className="w-full py-3 bg-purple-600 text-white rounded font-semibold text-sm hover:bg-purple-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            🚀 未収集の配信（{uncollectedCount}件）をすべて一括で自動収集する
          </button>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">
          個別収集したい配信のURL（1行に1つ）
        </label>
        <textarea
          className="w-full h-20 p-3 border rounded-md text-sm"
          placeholder="https://www.youtube.com/watch?v=xxxxx"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          disabled={isProcessing}
        />
      </div>

      <div className="flex gap-4 mb-6">
        {!isProcessing ? (
          <button
            onClick={handleStartCollection}
            className="px-6 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700"
          >
            選択したURLのデータを収集する
          </button>
        ) : (
          <button
            onClick={handleAbort}
            className="px-6 py-2 bg-red-600 text-white rounded-md font-medium hover:bg-red-700"
          >
            中断する
          </button>
        )}
        <span className="self-center text-sm text-gray-600 font-mono">
          ステータス: {statusText}
        </span>
      </div>

      {/* ローカル保存済みデータ一覧 */}
      <div className="border-t pt-6 mb-8">
        <h2 className="text-lg font-semibold mb-1">ローカル保存済みデータ一覧 ({savedList.length}件)</h2>
        <p className="text-xs text-gray-500 mb-3">dataフォルダに実ファイルとして保存されているデータです。</p>
        <ul className="bg-gray-50 border rounded-md divide-y max-h-60 overflow-y-auto">
          {savedList.length === 0 ? (
            <li className="p-4 text-sm text-gray-500">まだ保存されたデータはありません</li>
          ) : (
            savedList.map((item) => (
              <li key={item.videoId} className="p-3 flex justify-between items-center text-sm">
                <div>
                  <div className="font-semibold text-gray-800">{item.title}</div>
                  <div className="text-xs text-gray-400 font-mono">ID: {item.videoId}</div>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>更新: {new Date(item.updatedAt).toLocaleString()}</div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* 配信アーカイブ管理リスト */}
      <div className="border-t pt-6">
        <h2 className="text-lg font-semibold mb-1">配信アーカイブ管理リスト ({masterArchives.length}件)</h2>
        <p className="text-xs text-gray-500 mb-3">収集済みのものは黄色にハイライトされます。</p>

        <form onSubmit={handleAddManual} className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="YouTubeのURLまたはID"
            className="flex-1 p-2 border rounded text-sm"
            value={newUrlInput}
            onChange={(e) => setNewUrlInput(e.target.value)}
          />
          <input
            type="text"
            placeholder="タイトル（任意）"
            className="w-1/3 p-2 border rounded text-sm"
            value={newTitleInput}
            onChange={(e) => setNewTitleInput(e.target.value)}
          />
          <button type="submit" className="px-4 py-2 bg-gray-800 text-white rounded text-sm font-medium hover:bg-gray-700">
            個別追加
          </button>
        </form>

        <div className="bg-gray-50 border rounded-md divide-y max-h-80 overflow-y-auto">
          {masterArchives.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">管理リストに配信がありません。上の「チャンネルを同期する」ボタンを押してください。</div>
          ) : (
            masterArchives.map((target) => {
              const isCollected = savedVideoIds.has(target.videoId);
              const savedInfo = savedList.filter(s => s.videoId === target.videoId)[0];

              return (
                <div
                  key={target.videoId}
                  className={`p-3 flex justify-between items-center text-sm transition-colors ${
                    isCollected ? 'bg-yellow-100 border-l-4 border-yellow-500' : 'bg-white'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-gray-800">
                      {savedInfo?.title || target.title}
                    </div>
                    <div className="text-xs text-gray-500 font-mono">
                      ID: {target.videoId} {isCollected ? '✨ [収集済み]' : '⏳ [未収集]'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {!isCollected && (
                      <button
                        onClick={() => setUrlInput(prev => prev ? `${prev}\nhttps://www.youtube.com/watch?v=${target.videoId}` : `https://www.youtube.com/watch?v=${target.videoId}`)}
                        className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs font-medium"
                      >
                        入力欄に追加
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteMaster(target.videoId)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      削除
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}