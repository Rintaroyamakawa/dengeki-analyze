import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// 🛠️ 保存先を必ず public/data に固定
const dataDir = path.join(process.cwd(), 'public', 'data');

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (videoId) {
    const filePath = path.join(dataDir, `${videoId}.json`);
    if (fs.existsSync(filePath)) {
      const fileData = fs.readFileSync(filePath, 'utf-8');
      return NextResponse.json(JSON.parse(fileData));
    }
    return NextResponse.json({ error: 'Data not found' }, { status: 404 });
  }

  const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
  const list = files.map(file => {
    const filePath = path.join(dataDir, file);
    const stat = fs.statSync(filePath);
    const videoId = file.replace('.json', '');

    let title = videoId;
    let publishedAt = null;
    let collectedAt = null;
    let timestampCount = 0;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const json = JSON.parse(content);
      if (json.title) title = json.title;
      if (json.publishedAt) publishedAt = json.publishedAt;
      if (json.collectedAt) collectedAt = json.collectedAt;
      if (Array.isArray(json.timestamps)) {
        timestampCount = json.timestamps.length;
      }
    } catch (e) {}

    return {
      videoId,
      title,
      publishedAt,
      updatedAt: stat.mtime,
      collectedAt: collectedAt || stat.mtime.toISOString(),
      timestampCount,
    };
  });

  // デフォルトで新しい順にソートして返す
  list.sort((a, b) => {
    const timeA = new Date(a.publishedAt || a.collectedAt || 0).getTime();
    const timeB = new Date(b.publishedAt || b.collectedAt || 0).getTime();
    return timeB - timeA;
  });

  return NextResponse.json(list);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const videoId = body.videoId;

    if (!videoId) {
      return NextResponse.json({ error: 'Missing videoId' }, { status: 400 });
    }

    // 🛠️ 解析側（analyze）で取得した正確な publishedAt と title を最優先で使う
    let title = body.title || `配信アーカイブ #${videoId}`;
    let publishedAt = body.publishedAt !== undefined ? body.publishedAt : null;

    // タイトルが不明な場合のみoEmbedで補完
    try {
      if (!body.title || body.title === 'タイトル不明') {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        if (oembedRes.ok) {
          const oembedData = await oembedRes.json();
          if (oembedData.title) {
            title = oembedData.title;
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch YouTube oEmbed title:', e);
    }

    // 🛠️ 送られてきたデータを崩さず、正確な publishedAt を保持したまま保存
    const savedData = {
      ...body,
      videoId,
      title,
      publishedAt,
      collectedAt: new Date().toISOString(),
    };

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const filePath = path.join(dataDir, `${videoId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(savedData, null, 2), 'utf-8');

    return NextResponse.json({ success: true, videoId, title, publishedAt });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save data' }, { status: 500 });
  }
}