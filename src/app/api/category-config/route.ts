import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'src', 'config', 'category-config.json');

export type CategoryConfigData = {
  categories: string[];
  seriesMap: Record<string, string>;
  manualAssignments: Record<string, string>;
};

const DEFAULT_CONFIG: CategoryConfigData = {
  categories: [
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
  ],
  seriesMap: {
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
  },
  manualAssignments: {},
};

function readConfigFromFile(): CategoryConfigData {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        categories: Array.isArray(parsed.categories)
          ? parsed.categories
          : DEFAULT_CONFIG.categories,
        seriesMap:
          parsed.seriesMap && typeof parsed.seriesMap === 'object'
            ? { ...DEFAULT_CONFIG.seriesMap, ...parsed.seriesMap }
            : DEFAULT_CONFIG.seriesMap,
        manualAssignments:
          parsed.manualAssignments && typeof parsed.manualAssignments === 'object'
            ? parsed.manualAssignments
            : {},
      };
    }
  } catch (e) {
    console.error('category-config.json 読み込みエラー:', e);
  }
  return DEFAULT_CONFIG;
}

export async function GET() {
  const data = readConfigFromFile();
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const current = readConfigFromFile();

    const nextConfig: CategoryConfigData = {
      categories: Array.isArray(body.categories) ? body.categories : current.categories,
      seriesMap:
        body.seriesMap && typeof body.seriesMap === 'object'
          ? body.seriesMap
          : current.seriesMap,
      manualAssignments:
        body.manualAssignments && typeof body.manualAssignments === 'object'
          ? body.manualAssignments
          : current.manualAssignments,
    };

    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(nextConfig, null, 2), 'utf-8');

    return NextResponse.json({ ok: true, config: nextConfig });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '保存エラー';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}