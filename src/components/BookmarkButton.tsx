'use client';

import { useState } from 'react';

type BookmarkButtonProps = {
  initialBookmarked?: boolean;
  onToggle?: (isBookmarked: boolean) => void;
};

export default function BookmarkButton({
  initialBookmarked = false,
  onToggle,
}: BookmarkButtonProps) {
  const [isBookmarked, setIsBookmarked] = useState(initialBookmarked);
  const [videoKey, setVideoKey] = useState(0);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextState = !isBookmarked;
    setIsBookmarked(nextState);
    
    if (nextState) {
      // オンにした瞬間に動画のキーを変えてアニメーションを頭から再生させる
      setVideoKey(prev => prev + 1);
    }

    if (onToggle) {
      onToggle(nextState);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="relative flex items-center justify-center w-11 h-11 rounded-full hover:bg-gray-100/80 transition-transform active:scale-90 focus:outline-none cursor-pointer"
      aria-label="ブックマーク"
      title={isBookmarked ? 'ブックマーク解除' : '切り抜き用にブックマーク'}
    >
      {!isBookmarked ? (
        <img
          src="/lottie/ニコすこ！＿ブクマ＿オフ.png"
          alt="ブックマークオフ"
          className="w-7 h-7 object-contain select-none pointer-events-none transition-transform hover:scale-110"
        />
      ) : (
        <div className="w-9 h-9 flex items-center justify-center pointer-events-none select-none">
          {/* 🎥 プレビュー用・本番用の透過WebM動画 */}
          <video
            key={videoKey}
            src="/lottie/bookmark.webm" 
            autoPlay
            muted
            playsInline
            className="w-full h-full object-contain"
          />
        </div>
      )}
    </button>
  );
}