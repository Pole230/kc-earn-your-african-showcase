import React, { useEffect, useRef, useState } from "react";

type Role = "user" | "assistant";

type Message = {
  id: string;
  role: Role;
  text: string;
  createdAt: string;
  optimistic?: boolean;
};

function uid() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function KcEarnAiPanel(): JSX.Element {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: uid(),
      role: "assistant",
      text: "Hello 👋 I am KC AI. How can I help you today?",
      createdAt: new Date().toISOString(),
    },
  ]);

  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  function pushMessage(msg: Message) {
    setMessages((prev) => [...prev, msg]);
  }

  function replaceOptimistic(optimisticId: string, finalMsg: Message | null) {
    setMessages((prev) => {
      if (finalMsg === null) return prev.filter((m) => m.id !== optimisticId);
      return prev.map((m) => (m.id === optimisticId ? finalMsg : m));
    });
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const text = input.trim();
    const optimisticMessage: Message = {
      id: uid(),
      role: "user",
      text,
      createdAt: new Date().toISOString(),
      optimistic: true,
    };

    pushMessage(optimisticMessage);
    setInput("");
    setLoading(true);

    try {
      const tokenResponse = await fetch("/api/public/view-context");
      // we don't need the token for AI but keep a call to avoid blocking; this is intentionally lightweight
      void tokenResponse;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // We send a minimal representation compatible with the server route which expects UIMessage[]
          messages: [
            { id: uid(), role: "user", parts: [{ type: "text", text }] },
          ],
        }),
      });

      if (!res.ok) {
        replaceOptimistic(optimisticMessage.id, null);
        pushMessage({
          id: uid(),
          role: "assistant",
          text: "KC AI is temporarily unavailable.",
          createdAt: new Date().toISOString(),
        });
        return;
      }

      // Attempt to read as text (the /api/chat route can stream; here we try to read whole body)
      const body = await res.text();

      // The streaming endpoint may send NDJSON or progressively framed UIMessage events. We'll attempt a best-effort parse.
      let reply = "";
      try {
        // Try parse as JSON first
        const json = JSON.parse(body) as any;
        reply = json.reply ?? json.text ?? JSON.stringify(json);
      } catch {
        // Fallback: use raw text as reply
        reply = body;
      }

      replaceOptimistic(optimisticMessage.id, { ...optimisticMessage, optimistic: false });

      pushMessage({ id: uid(), role: "assistant", text: reply || "I could not generate a reply.", createdAt: new Date().toISOString() });
    } catch (err) {
      console.error("KC AI request failed", err);
      replaceOptimistic(optimisticMessage.id, null);
      pushMessage({ id: uid(), role: "assistant", text: "KC AI is temporarily unreachable.", createdAt: new Date().toISOString() });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div role="dialog" aria-label="KC AI chat" className="fixed bottom-20 right-5 z-50 w-80 max-w-full rounded-2xl border bg-background shadow-xl">
      <div className="border-b p-4 font-bold">🤖 KC AI</div>

      <div ref={scrollRef} className="h-80 space-y-3 overflow-y-auto p-4">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const containerClass = isUser
            ? "ml-auto rounded-xl bg-primary p-3 text-primary-foreground"
            : "rounded-xl bg-muted p-3 text-foreground";
          return (
            <div key={msg.id} className={containerClass}>
              <div className="whitespace-pre-wrap break-words text-sm">{msg.text}</div>
              <div className="mt-1 text-xs text-muted-foreground">{new Date(msg.createdAt).toLocaleTimeString()}{msg.optimistic ? " · sending…" : ""}</div>
            </div>
          );
        })}

        {loading && <div className="rounded-xl bg-muted p-3 text-sm">KC AI is thinking…</div>}
      </div>

      <div className="flex gap-2 border-t p-3">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendMessage();
            }
          }}
          aria-label="Ask KC AI"
          placeholder="Ask KC AI..."
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-brand"
          disabled={loading}
        />

        <button
          type="button"
          onClick={() => void sendMessage()}
          disabled={loading || !input.trim()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {loading ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
