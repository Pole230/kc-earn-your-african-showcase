@@
-        <button type="button" className="flex items-center gap-1.5 text-sm transition-colors hover:text-brand" onClick={() => navigate({ to: "/video/$id", params: { id: video.id } })}>
-          <Heart className="size-[18px]" /> {formatCount(video.views_count)}
-        </button>
+        <LikeButton videoId={video.id} initialCount={video.views_count} />
@@
-        <button type="button" className="flex items-center gap-1.5 text-sm transition-colors hover:text-brand" onClick={() => navigate({ to: "/video/$id", params: { id: video.id } })}>
-          <MessageCircle className="size-[18px]" /> 0
-        </button>
+        <button type="button" className="flex items-center gap-1.5 text-sm transition-colors hover:text-brand" onClick={() => navigate({ to: "/video/$id", params: { id: video.id } })}>
+          <MessageCircle className="size-[18px]" /> 0
+        </button>
@@
       </div>
     </article>
   );
 }
+
+// Small like button component to handle optimistic UI and Supabase interaction
+import React, { useEffect, useState } from "react";
+import { Heart } from "lucide-react";
+import { getLikesCount, hasUserLiked, toggleLike } from "@/lib/social";
+
+function LikeButton({ videoId, initialCount }: { videoId: string; initialCount: number }) {
+  const [count, setCount] = useState(initialCount || 0);
+  const [liked, setLiked] = useState(false);
+  const [busy, setBusy] = useState(false);
+
+  useEffect(() => {
+    let mounted = true;
+    (async () => {
+      try {
+        const [c, h] = await Promise.all([getLikesCount(videoId), hasUserLiked(videoId)]);
+        if (!mounted) return;
+        setCount(c ?? 0);
+        setLiked(Boolean(h));
+      } catch (err) {
+        console.error("LikeButton init error", err);
+      }
+    })();
+    return () => {
+      mounted = false;
+    };
+  }, [videoId]);
+
+  async function onToggle(e: React.MouseEvent) {
+    e.stopPropagation();
+    if (busy) return;
+    setBusy(true);
+    // optimistic
+    setLiked((s) => !s);
+    setCount((n) => (liked ? Math.max(0, n - 1) : n + 1));
+    try {
+      const res = await toggleLike(videoId);
+      setLiked(res.liked);
+      setCount(res.count);
+    } catch (err) {
+      // revert
+      setLiked((s) => !s);
+      setCount((n) => (liked ? n + 1 : Math.max(0, n - 1)));
+      console.error("toggleLike failed", err);
+    } finally {
+      setBusy(false);
+    }
+  }
+
+  return (
+    <button
+      type="button"
+      onClick={onToggle}
+      className={`flex items-center gap-1.5 text-sm transition-colors ${liked ? "text-brand" : "text-muted-foreground"}`}
+      aria-pressed={liked}
+    >
+      <Heart className="size-[18px]" /> {formatCount(count)}
+    </button>
+  );
+}
