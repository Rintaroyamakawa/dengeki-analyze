import { NextRequest, NextResponse } from 'next/server';
import { Innertube } from 'youtubei.js';

let youtubeClient: Innertube | null = null;

async function getYoutubeClient() {
  if (!youtubeClient) {
    youtubeClient = await Innertube.create({ retrieve_player: false });
  }
  return youtubeClient;
}

function extractVideoId(url: string): string | null {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|live\/)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

function timeToSeconds(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function extractTimestampsFromText(text: string, author: string) {
  const lines = text.split('\n');
  const results: { time: string; seconds: number; label: string; source: string; author: string }[] = [];
  const timeRegex = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/;

  for (const line of lines) {
    const match = line.match(timeRegex);
    if (match) {
      const timeStr = match[1];
      const label = line.replace(timeStr, '').replace(/^[\s\-・:：]+/, '').trim() || '（見どころ）';
      results.push({
        time: timeStr,
        seconds: timeToSeconds(timeStr),
        label,
        source: 'コメント',
        author,
      });
    }
  }
  return results;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = body.url;
    const videoId = extractVideoId(url);

    if (!videoId) {
      return NextResponse.json({ error: '有効なYouTube URLではありません' }, { status: 400 });
    }

    const youtube = await getYoutubeClient();
    const info = await youtube.getBasicInfo(videoId);

    // 🛠️ タイトルを確実に取得（youtubei.jsが失敗した場合はYouTube公式oEmbed APIで必ず取得）
    let title = info.basic_info?.title;
    if (!title || title === 'タイトル不明') {
      try {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        if (oembedRes.ok) {
          const oembedData = await oembedRes.json();
          if (oembedData.title) {
            title = oembedData.title;
          }
        }
      } catch (e) {
        console.warn('oEmbed取得失敗:', e);
      }
    }
    title = title || 'タイトル不明';

    const duration = info.basic_info.duration || 0;
    
    const rawDate = info.basic_info.start_timestamp || info.basic_info.upload_date;
    const publishedAt = rawDate ? new Date(rawDate).toISOString() : null;

    let rawTimestamps: { time: string; seconds: number; label: string; source: string; author: string }[] = [];

    try {
      const commentsSection: any = await youtube.getComments(videoId);
      const contents = commentsSection?.contents || commentsSection;
      
      if (contents && Array.isArray(contents)) {
        for (const thread of contents) {
          const comment = thread.comment;
          if (comment?.content?.text) {
            const text = comment.content.text;
            const author = comment.author?.name || '視聴者';
            const extracted = extractTimestampsFromText(text, author);
            rawTimestamps = rawTimestamps.concat(extracted);
          }

          const replies = thread.replies?.contents || thread.replies;
          if (replies && Array.isArray(replies)) {
            for (const reply of replies) {
              const replyComment = reply.comment;
              if (replyComment?.content?.text) {
                const text = replyComment.content.text;
                const replyAuthor = replyComment.author?.name || '視聴者';
                const extracted = extractTimestampsFromText(text, replyAuthor);
                rawTimestamps = rawTimestamps.concat(extracted);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('コメント取得スキップ:', e);
    }

    const mergedMap = new Map<number, { time: string; seconds: number; label: string; source: string; authors: string[]; count: number }>();

    for (const item of rawTimestamps) {
      let foundKey = -1;
      for (const key of mergedMap.keys()) {
        if (Math.abs(key - item.seconds) <= 15) {
          foundKey = key;
          break;
        }
      }

      if (foundKey !== -1) {
        const group = mergedMap.get(foundKey)!;
        group.count += 1;
        if (!group.authors.includes(item.author)) {
          group.authors.push(item.author);
        }
        if (group.label === '（見どころ）' && item.label !== '（見どころ）') {
          group.label = item.label;
          group.time = item.time;
          group.seconds = item.seconds;
        }
      } else {
        mergedMap.set(item.seconds, {
          time: item.time,
          seconds: item.seconds,
          label: item.label,
          source: 'コメント',
          authors: [item.author],
          count: 1,
        });
      }
    }

    const allTimestamps = Array.from(mergedMap.values());
    allTimestamps.sort((a, b) => a.seconds - b.seconds);

    const minuteMap: { [key: number]: number } = {};
    let chatFetchedCount = 0;

    try {
      const livechat: any = await info.getLiveChat();
      if (livechat && livechat.actions) {
        for (const action of livechat.actions) {
          const offsetMs = action.video_offset_time_msec || action.item?.video_offset_time_msec || 0;
          if (offsetMs > 0) {
            const seconds = Math.floor(Number(offsetMs) / 1000);
            const minuteKey = Math.floor(seconds / 60);
            minuteMap[minuteKey] = (minuteMap[minuteKey] || 0) + 1;
            chatFetchedCount++;
          }
        }
      }
    } catch (e) {
      console.warn('ライブチャットリプレイの取得に失敗しました:', e);
    }

    if (chatFetchedCount < 5) {
      allTimestamps.forEach(item => {
        const minuteKey = Math.floor(item.seconds / 60);
        minuteMap[minuteKey] = (minuteMap[minuteKey] || 0) + (item.count * 10);
      });
    }

    const totalMinutes = Math.ceil(duration / 60);
    const heatmapData = [];
    let maxCount = 1;

    for (let m = 0; m < totalMinutes; m++) {
      const count = minuteMap[m] || 0;
      if (count > maxCount) maxCount = count;
      
      const hours = Math.floor(m / 60);
      const mins = m % 60;
      const timeLabel = hours > 0 ? `${hours}h${mins}m` : `${mins}m`;

      heatmapData.push({
        minute: m,
        timeLabel,
        count,
      });
    }

    return NextResponse.json({
      videoId,
      title,
      duration,
      publishedAt,
      timestamps: allTimestamps,
      heatmapData,
      maxCount,
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: `エラー: ${error.message || '動画情報の取得に失敗しました'}` }, { status: 500 });
  }
}