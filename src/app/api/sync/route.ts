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

    // 2. プレイリストから動画を全件取得
    const videos: { videoId: string; title: string; publishedAt: string }[] = [];
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
          videos.push({
            videoId: snippet.resourceId.videoId,
            title: snippet.title,
            publishedAt: snippet.publishedAt,
          });
        }
      }

      pageToken = playlistData.nextPageToken || '';
    } while (pageToken);

    return NextResponse.json({ success: true, videos });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'YouTubeデータの同期に失敗しました' }, { status: 500 });
  }
}