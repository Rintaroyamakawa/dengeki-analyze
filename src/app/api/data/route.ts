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
    const { videoId, data } = body;

    if (!videoId) {
      return NextResponse.json({ error: 'Missing videoId' }, { status: 400 });
    }

    let title = data?.title || `配信アーカイブ #${videoId}`;
    let publishedAt = data?.publishedAt || null;

    try {
      // 1. タイトルをoembedから取得
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        if (oembedData.title) {
          title = oembedData.title;
        }
      }

      // 2. 公開日時をYouTubeのページHTMLから自動取得
      const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (pageRes.ok) {
        const html = await pageRes.text();
        const match = html.match(/itemprop="datePublished"\s+content="([^"]+)"/);
        if (match && match[1]) {
          publishedAt = match[1];
        }
      }
    } catch (e) {
      console.error('Failed to fetch YouTube metadata:', e);
    }

    const savedData = {
      ...data,
      videoId,
      title,
      publishedAt: publishedAt || null,
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