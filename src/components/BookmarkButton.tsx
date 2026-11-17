'use client';

import { useState, useRef } from 'react';
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
  const lottieRef = useRef<any>(null);
  const [isBookmarked, setIsBookmarked] = useState(initialBookmarked);
  const [showLottie, setShowLottie] = useState(initialBookmarked);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextState = !isBookmarked;
    setIsBookmarked(nextState);
    setShowLottie(true);

    if (nextState) {
      setTimeout(() => {
        if (lottieRef.current) {
          lottieRef.current.setDirection(1);
          lottieRef.current.play();
        }
      }, 10);
    } else {
      if (lottieRef.current) {
        lottieRef.current.setDirection(-1);
        lottieRef.current.play();
      }
    }

    if (onToggle) {
      onToggle(nextState);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="relative flex items-center justify-center w-11 h-11 rounded-full hover:bg-gray-100/80 transition-colors focus:outline-none cursor-pointer"
      aria-label="ブックマーク"
      title={isBookmarked ? 'ブックマーク解除' : '切り抜き用にブックマーク'}
    >
      {!isBookmarked && !showLottie ? (
        <img
          src="/lottie/ニコすこ！＿ブクマ＿オフ.png"
          alt="ブックマークオフ"
          className="w-7 h-7 object-contain select-none pointer-events-none"
        />
      ) : (
        <div className="w-10 h-10 pointer-events-none select-none flex items-center justify-center">
          <Lottie
            lottieRef={lottieRef}
            animationData={animationData}
            loop={false}
            autoplay={isBookmarked}
          />
        </div>
      )}
    </button>
  );
}