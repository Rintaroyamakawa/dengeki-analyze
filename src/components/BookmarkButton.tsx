'use client';

import { useState, useRef, useEffect } from 'react';

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
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextState = !isBookmarked;
    setIsBookmarked(nextState);
    
    if (nextState) {
      setVideoKey(prev => prev + 1);
    }

    if (onToggle) {
      onToggle(nextState);
    }
  };

  useEffect(() => {
    if (isBookmarked && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(err => {
        console.log('Autoplay prevented:', err);
      });
    }
  }, [isBookmarked, videoKey]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="relative flex items-center justify-center w-11 h-11 rounded-full hover:bg-gray-100/80 transition-transform active:scale-90 focus:outline-none cursor-pointer"
      aria-label="切り抜きポイント"
      title={isBookmarked ? '切り抜きポイント解除' : '切り抜きポイントに追加'}
    >
      {!isBookmarked ? (
        <img
          src="/lottie/ニコすこ！＿ブクマ＿オフ.png"
          alt="切り抜きポイントオフ"
          className="w-7 h-7 object-contain select-none pointer-events-none transition-transform hover:scale-110"
        />
      ) : (
        <div className="w-9 h-9 flex items-center justify-center pointer-events-none select-none">
          {/* 🎥 変更後のWebMファイル名に更新 */}
          <video
            ref={videoRef}
            key={videoKey}
            src="/lottie/niko_bookmark.webm" 
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