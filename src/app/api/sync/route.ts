import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { channelInput } = await request.json();
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'YouTube APIキーが設定されていません (.env.localを確認してください)' },
        { status: 500 }
      );
    }

    const input = channelInput.trim();
    let channelId = '';

    // UCから始まるチャンネルIDが直接入力された場合、またはURLに含まれる場合
    if (input.startsWith('UC')) {
      channelId = input;
    } else if (input.includes('/channel/')) {
      channelId = input.split('/channel/')[1].split('/')[0].split('?')[0];
    } else {
      // ハンドル（@〜）の場合は forHandle で取得
      let handle = input;
      if (handle.includes('youtube.com/@')) {
        handle = '@' + handle.split('@')[1].split('/')[0].split('?')[0];
      } else if (!handle.startsWith('@')) {
        handle = '@' + handle;
      }

      const handleRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`
      );
      const handleData = await handleRes.json();

      if (handleData.error) {
        return NextResponse.json(
          { error: `YouTube APIエラー: ${handleData.error.message}` },
          { status: 400 }
        );
      }

      if (handleData.items && handleData.items.length > 0) {
        channelId = handleData.items[0].id;
      }
    }

    if (!channelId) {
      return NextResponse.json(
        { error: 'チャンネルIDが見つかりませんでした。UCから始まるIDか@ハンドルを確認してください。' },
        { status: 400 }
      );
    }

    // 1. チャンネルの uploads プレイリストIDを取得
    const channelRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`
    );
    const channelData = await channelRes.json();

    if (channelData.error) {
      return NextResponse.json(
        { error: `YouTube APIエラー: ${channelData.error.message}` },
        { status: 400 }
      );
    }

    if (!channelData.items || channelData.items.length === 0) {
      return NextResponse.json(
        { error: `チャンネル情報が見つかりませんでした。(指定ID: ${channelId})` },
        { status: 404 }
      );
    }

    const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;

    // 2. プレイリストから全動画のIDを一旦取得
    const candidateIds: string[] = [];
    let pageToken = '';

    do {
      const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}&key=${apiKey}`;
      const playlistRes = await fetch(playlistUrl);
      const playlistData = await playlistRes.json();

      if (playlistData.error) {
        return NextResponse.json(
          { error: `動画一覧の取得エラー: ${playlistData.error.message}` },
          { status: 400 }
        );
      }

      if (!playlistData.items) break;

      for (const item of playlistData.items) {
        const snippet = item.snippet;
        if (snippet.title && snippet.title !== 'Private video' && snippet.title !== 'Deleted video') {
          candidateIds.push(snippet.resourceId.videoId);
        }
      }

      pageToken = playlistData.nextPageToken || '';
    } while (pageToken);

    // 3. 50件ずつ詳細情報（配信情報・ステータス）を取得して除外条件を適用
    const filteredVideos: { videoId: string; title: string; publishedAt: string }[] = [];

    for (let i = 0; i < candidateIds.length; i += 50) {
      const batchIds = candidateIds.slice(i, i + 50).join(',');
      const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails,status&id=${batchIds}&key=${apiKey}`;
      const detailsRes = await fetch(detailsUrl);
      const detailsData = await detailsRes.json();

      if (detailsData.error) {
        return NextResponse.json(
          { error: `動画詳細の取得エラー: ${detailsData.error.message}` },
          { status: 400 }
        );
      }

      if (!detailsData.items) continue;

      for (const video of detailsData.items) {
        const title: string = video.snippet?.title || '';
        const description: string = video.snippet?.description || '';
        const privacyStatus: string = video.status?.privacyStatus || '';
        const liveDetails = video.liveStreamingDetails;

        // 条件1 & 4: タイトルに「スケジュール」または「発売中」が含まれるものを除外
        if (title.includes('スケジュール') || title.includes('発売中')) {
          continue;
        }

        // 条件2 & 3 (+待機所除外): ライブ配信の完了済みアーカイブのみ許可（通常動画・ショート・未配信待機所を除外）
        if (!liveDetails || !liveDetails.actualEndTime) {
          continue;
        }

        // 条件5: メンバー限定配信・非公開を除外
        if (privacyStatus !== 'public') {
          continue;
        }
        if (
          title.includes('メンバー限定') ||
          title.includes('メン限') ||
          description.includes('メンバー限定')
        ) {
          continue;
        }

        filteredVideos.push({
          videoId: video.id,
          title,
          publishedAt: liveDetails.actualStartTime || video.snippet.publishedAt,
        });
      }
    }

    return NextResponse.json({ success: true, videos: filteredVideos });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'YouTubeデータの同期に失敗しました' }, { status: 500 });
  }
}