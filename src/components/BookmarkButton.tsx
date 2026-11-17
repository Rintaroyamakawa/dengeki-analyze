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
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextState = !isBookmarked;
    setIsBookmarked(nextState);
    setIsAnimating(true);

    // アニメーション用のクラスをリセットするための一時タイマー
    setTimeout(() => setIsAnimating(false), 300);

    if (onToggle) {
      onToggle(nextState);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`relative flex items-center justify-center w-11 h-11 rounded-full hover:bg-gray-100/80 transition-transform focus:outline-none cursor-pointer ${
        isAnimating ? 'scale-125' : 'scale-100'
      }`}
      aria-label="ブックマーク"
      title={isBookmarked ? 'ブックマーク解除' : '切り抜き用にブックマーク'}
    >
      {!isBookmarked ? (
        <img
          src="/lottie/ニコすこ！＿ブクマ＿オフ.png"
          alt="ブックマークオフ"
          className="w-7 h-7 object-contain select-none pointer-events-none transition-transform"
        />
      ) : (
        <span className="text-2xl select-none animate-bounce">⭐</span>
      )}
    </button>
  );
}