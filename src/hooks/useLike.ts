import { useCallback, useState } from "react";

export function parseDisplayCount(display: string | number | undefined) {
  if (display == null) return 0;
  if (typeof display === "number") return display;
  const s = String(display).trim();
  // handle '14.2K', '1.2M', '812'
  const m = s.match(/^([0-9,.]+)\s*([KM])?$/i);
  if (!m) {
    const n = Number(s.replace(/[^0-9]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  let num = Number(m[1].replace(/,/g, ""));
  const suffix = (m[2] || "").toUpperCase();
  if (suffix === "K") num = Math.round(num * 1000);
  if (suffix === "M") num = Math.round(num * 1000000);
  return Number.isFinite(num) ? num : 0;
}

export function useLike(initialCount = 0, initialLiked = false) {
  const [liked, setLiked] = useState<boolean>(initialLiked);
  const [count, setCount] = useState<number>(initialCount);
  const [loading, setLoading] = useState(false);

  const toggle = useCallback(
    async (videoId: string) => {
      if (loading) return;
      setLoading(true);
      const prevLiked = liked;
      const prevCount = count;

      // optimistic
      setLiked(!prevLiked);
      setCount(prevCount + (prevLiked ? -1 : 1));

      try {
        const res = await fetch("/api/likes/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const action = json.action;
        const likes_count = json.likes_count;
        if (typeof likes_count === "number" && !Number.isNaN(likes_count)) {
          setCount(likes_count);
        } else if (action === "liked") {
          setCount(prevCount + 1);
        } else if (action === "unliked") {
          setCount(Math.max(0, prevCount - 1));
        }
        setLiked(action === "liked");
      } catch (err) {
        console.error("toggle like failed", err);
        // rollback
        setLiked(prevLiked);
        setCount(prevCount);
      } finally {
        setLoading(false);
      }
    },
    [liked, count, loading],
  );

  return { liked, count, toggle, loading } as const;
}
