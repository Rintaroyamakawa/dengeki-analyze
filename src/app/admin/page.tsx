'use client';

import { useState } from 'react';

export default function AdminPage() {
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleBatchAnalyze = async () => {
    if (!confirm('public/data 内にあるすべてのアーカイブJSONを一括再解析して保存しますか？')) {
      return;
    }

    setLoading(true);
    setStatusText('対象の動画リストを取得中...');

    try {
      // /api/analyze から既存の動画IDリストを取得
      const listRes = await fetch('/api/analyze');
      const listData = await listRes.json();
      const videos = listData.videos || [];

      if (videos.length === 0) {
        alert('解析対象の動画が見つかりませんでした。');
        setLoading(false);
        return;
      }

      setProgress({ current: 0, total: videos.length });
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        setStatusText(`(${i + 1} / ${videos.length}) 「${video.videoId}」を解析・保存中...`);

        try {
          const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${video.videoId}` }),
          });

          if (res.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (e) {
          console.error(`${video.videoId} の解析エラー:`, e);
          failCount++;
        }

        setProgress({ current: i + 1, total: videos.length });
      }

      setLoading(false);
      setStatusText(`完了！ 成功: ${successCount}件, 失敗: ${failCount}件`);
      alert('すべての一括解析と保存が完了しました！');

    } catch (error: any) {
      console.error('一括解析エラー:', error);
      alert(`エラーが発生しました: ${error.message}`);
      setLoading(false);
    }
  };

  return (
    <main className="p-8 max-w-4xl mx-auto font-sans">
      <h1 className="text-2xl font-bold mb-6">管理画面 - 一括データ生成ツール</h1>

      <div className="bg-white p-6 rounded-lg shadow border mb-6">
        <h2 className="text-lg font-semibold mb-2">ヒートマップJSON 一括作成</h2>
        <p className="text-gray-600 text-sm mb-4">
          ローカル環境（<code>npm run dev</code>）でこのボタンを押すと、登録されているすべてのアーカイブを一括で再解析し、<code>public/data/</code> フォルダのJSONを最新の状態に一括更新します。
        </p>

        <button
          onClick={handleBatchAnalyze}
          disabled={loading}
          className={`px-6 py-3 rounded-lg text-white font-bold transition-colors ${
            loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {loading ? '一括解析を実行中...' : 'すべてのアーカイブを一括解析して保存'}
        </button>

        {loading && (
          <div className="mt-6">
            <p className="text-sm font-medium text-gray-700 mb-2">{statusText}</p>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-500 mt-1 text-right">
              {progress.current} / {progress.total} 完了
            </p>
          </div>
        )}
      </div>
    </main>
  );
}