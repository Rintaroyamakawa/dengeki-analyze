'use client';

import { useState } from 'react';
import * as lottieReact from 'lottie-react';
const Lottie = (lottieReact as any).default || lottieReact;

// @ts-ignore
import animationData from '../lottie/niko-bookmark.json';

type BookmarkButtonProps = {
  initialBookmarked?: boolean;
  onToggle?: (isBookmarked: boolean) => void;
};

export default function BookmarkButton({
  initialBookmarked = false,
  onToggle,
}: BookmarkButtonProps) {
  const [isBookmarked, setIsBookmarked] = useState(initialBookmarked);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextState = !isBookmarked;
    setIsBookmarked(nextState);
    if (onToggle) {
      onToggle(nextState);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="relative flex items-center justify-center w-11 h-11 rounded-full hover:bg-gray-100/85 transition-colors focus:outline-none cursor-pointer"
      aria-label="ブックマーク"
      title={isBookmarked ? 'ブックマーク解除' : '切り抜き用にブックマーク'}
    >
      {!isBookmarked ? (
        <img
          src="/lottie/ニコすこ！＿ブクマ＿オフ.png"
          alt="ブックマークオフ"
          className="w-7 h-7 object-contain select-none pointer-events-none"
        />
      ) : (
        <div className="w-9 h-9 pointer-events-none select-none flex items-center justify-center">
          <Lottie
            key="bookmark-active"
            animationData={animationData}
            loop={false}
            autoplay={true}
          />
        </div>
      )}
    </button>
  );
}