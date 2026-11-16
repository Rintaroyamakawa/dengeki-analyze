'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type ArchiveItem = {
  videoId: string;
  title: string;
  publishedAt: string | null;
  updatedAt: string;
  timestampCount: number;
  category?: string; // 手動設定用
};

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

export default function AdminPage() {
  const [archives, setArchives] = useState<ArchiveItem[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // ローカルストレージからカスタムカテゴリや手動割り当てを読み込む
    const savedCategories = localStorage.getItem('custom_categories');
    if (savedCategories) {
      try {
        setCategories(JSON.parse(savedCategories));
      } catch (e) {
        console.error(e);
      }
    }

    const fetchArchives = async () => {
      try {
        const res = await fetch('/api/data');
        if (res.ok) {
          const list = await res.json();
          // ローカルストレージから割り当て情報を復元
          const manualMap = JSON.parse(localStorage.getItem('manual_assignments') || '{}');
          const initialized = list.map((item: ArchiveItem) => ({
            ...item,
            category: manualMap[item.videoId] || '',
          }));
          setArchives(initialized);
        }
      } catch (e) {
        console.error('データ取得エラー:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchArchives();
  }, []);

  // 新しい項目の追加
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
    setMessage('新しい項目を追加しました！');
    setTimeout(() => setMessage(''), 3000);
  };

  // 各アーカイブのカテゴリ変更
  const handleCategoryChange = (videoId: string, newCat: string) => {
    const updated = archives.map(item => 
      item.videoId === videoId ? { ...item, category: newCat } : item
    );
    setArchives(updated);

    // ローカルストレージに保存
    const manualMap: { [key: string]: string } = {};
    updated.forEach(item => {
      if (item.category) {
        manualMap[item.videoId] = item.category;
      }
    });
    localStorage.setItem('manual_assignments', JSON.stringify(manualMap));
    setMessage('変更を保存しました！');
    setTimeout(() => setMessage(''), 2000);
  };

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 font-sans pb-16">
      <header className="bg-white border-b sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚙️</span>
            <h1 className="text-lg font-extrabold tracking-tight text-gray-900">
              データ管理・項目編集 (管理者画面)
            </h1>
          </div>
          <Link
            href="/"
            className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded transition-colors"
          >
            🏠 サイトに戻る
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg text-sm font-bold">
            ✨ {message}
          </div>
        )}

        {/* 新規項目の追加セクション */}
        <section className="bg-white border rounded-xl p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
            <span>➕</span>
            <span>新しい項目（カテゴリ・シリーズ）の追加</span>
          </h2>
          <form onSubmit={handleAddCategory} className="flex gap-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="例: 🎨 お絵描き配信、💡 新企画 など..."
              className="border border-gray-300 p-2.5 flex-1 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="bg-blue-600 text-white font-bold text-sm px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors shrink-0"
            >
              項目を追加
            </button>
          </form>
        </section>

        {/* アーカイブの選択・手動割り当てセクション */}
        <section className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
            <span>📋</span>
            <span>アーカイブごとの項目（カテゴリ）選択・管理</span>
          </h2>
          <p className="text-xs text-gray-500">
            自動判定がズレている動画や、別の項目に動かしたい動画は、プルダウンから自由に変更できます（ブラウザに自動保存されます）。
          </p>

          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">読み込み中...</div>
          ) : (
            <div className="border rounded-lg overflow-hidden divide-y">
              {archives.map((item) => (
                <div key={item.videoId} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 flex-1">
                    <img
                      src={`https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`}
                      alt={item.title}
                      className="w-24 aspect-video object-cover rounded shrink-0 bg-gray-900"
                    />
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold text-gray-800 line-clamp-2">
                        {item.title}
                      </h3>
                      <p className="text-[10px] text-gray-400 font-mono">
                        ID: {item.videoId}
                      </p>
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