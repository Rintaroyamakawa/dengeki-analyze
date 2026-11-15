import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');

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
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        if (oembedData.title) {
          title = oembedData.title;
        }
      }
    } catch (e) {}

    const savedData = {
      ...data,
      videoId,
      title,
      publishedAt: data?.publishedAt || null,
      collectedAt: new Date().toISOString(),
    };

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const filePath = path.join(dataDir, `${videoId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(savedData, null, 2), 'utf-8');

    return NextResponse.json({ success: true, videoId, title });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save data' }, { status: 500 });
  }
}