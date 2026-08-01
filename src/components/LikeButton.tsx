import { useState } from "react";
import { Heart } from "lucide-react";

export function LikeButton({ count = 0 }: { count?: number }) {
  const [liked, setLiked] = useState(false);
  const [localCount, setLocalCount] = useState(count);

  return (
    <button
      type="button"
      onClick={() => {
        setLiked((prev) => !prev);
        setLocalCount((prev) => (liked ? prev - 1 : prev + 1));
      }}
      className="flex items-center gap-1.5 text-sm transition-colors hover:text-brand"
    >
      <Heart className={`size-[18px] ${liked ? "text-red-500" : ""}`} />
      {localCount}
    </button>
  );
}
