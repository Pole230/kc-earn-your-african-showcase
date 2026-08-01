import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { clearAiHistory, loadAiHistory } from "@/lib/ai-chat.functions";
import aiLogo from "@/assets/kc-earn-ai.png";

const SUGGESTIONS = [
  "Give me 5 video ideas for the Funny category",
  "Write a caption and hashtags for a Lagos street food clip",
  "What's trending with African creators right now?",
  "How do I grow my audience across Africa?",
];

function WelcomeScreen({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center px-2 py-8 text-center">
      <img
        src={aiLogo}
        alt="KC Earn AI"
        width={512}
        height={512}
        loading="lazy"
        className="size-20 drop-shadow-[0_10px_30px_oklch(0.75_0.17_55/0.35)]"
      />
      <h2 className="mt-4 text-xl font-bold">KC Earn AI – Your Smart Creator Assistant</h2>
      <p className="mt-2 text-sm font-semibold tracking-wide text-brand">
        Create. Share. Earn. Powered by AI.
      </p>
      <p className="mt-3 max-w-sm text-sm text-muted-foreground">
        Ideas, captions, hashtags, trends and growth strategy built for African creators.
      </p>
      <div className="mt-6 grid w-full gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="rounded-2xl border border-border bg-surface px-4 py-3 text-left text-sm text-foreground transition-colors hover:border-brand/60 hover:bg-surface-strong"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatPanel({
  userId,
  initialMessages,
  onClose,
}: {
  userId: string;
  initialMessages: UIMessage[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, status, setMessages, error } = useChat({
    id: `kc-earn-ai-${userId}`,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: async (): Promise<Record<string, string>> => {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
    onError: (err) => {
      const message = err.message?.includes("429")
        ? "KC Earn AI is busy right now — try again in a moment."
        : err.message?.includes("402")
        ? "AI credits are exhausted. Please top up to keep chatting."
        : "KC Earn AI couldn't respond. Please try again.";
      toast.error(message);
    },
  });

  const busy = status === "submitted" || status === "streaming";

  const focusInput = () => textareaRef.current?.focus();

  useEffect(() => {
    focusInput();
  }, []);

  useEffect(() => {
    if (status === "ready") focusInput();
  }, [status]);

  const clearMutation = useMutation({
    mutationFn: () => clearAiHistory(),
    onSuccess: () => {
      setMessages([]);
      queryClient.setQueryData(["ai-history", userId], []);
      toast.success("Chat cleared");
      focusInput();
    },
    onError: () => toast.error("Couldn't clear the chat"),
  });

  const submit = (text: string) => {
    const value = text.trim();
    if (!value || busy) return;
    setInput("");
    void sendMessage({ text: value });
  };

  // Tool helpers
  const [toolLoading, setToolLoading] = useState<null | string>(null);

  async function callTool(endpoint: string, payload: object) {
    setToolLoading(endpoint);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      // Use the same transport format: POST to endpoint with Authorization header
      const transport = new DefaultChatTransport({
        api: endpoint,
        headers: async () => ({ Authorization: `Bearer ${token}` }),
      });

      // Create a UI message from the tool request so history persists client-side
      const toolMessage = await transport.send({ text: JSON.stringify(payload) } as any);

      // transport.send returns a promise that resolves when streaming completes in this SDK
      // but useChat's sendMessage handles streaming into the existing messages list; to reuse that
      // we instead call sendMessage with the payload text and a custom transport for this send.

      // Use sendMessage to append user message and stream the assistant response
      await sendMessage({ text: JSON.stringify(payload), transport });

      // Optionally, invalidate server-side history so loadAiHistory sees new messages
      await queryClient.invalidateQueries(["ai-history", userId]);
    } catch (err: any) {
      console.error('[kc-earn-ai] tool error', err);
      toast.error(err?.message ?? 'Tool error');
    } finally {
      setToolLoading(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <img
          src={aiLogo}
          alt=""
          width={512}
          height={512}
          loading="lazy"
          className="size-9 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">KC Earn AI</p>
          <p className="truncate text-[11px] text-muted-foreground">
            Create. Share. Earn. Powered by AI.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => callTool('/api/ai/tools/title', { topic: 'Lagos street food', category: 'Food' })} disabled={!!toolLoading}>
            {toolLoading === '/api/ai/tools/title' ? 'Generating…' : 'Generate Title'}
          </Button>
          <Button size="sm" onClick={() => callTool('/api/ai/tools/caption', { description: 'Vendor making suya with spices', mood: 'excited' })} disabled={!!toolLoading}>
            {toolLoading === '/api/ai/tools/caption' ? 'Generating…' : 'Create Caption'}
          </Button>
          <Button size="sm" onClick={() => callTool('/api/ai/tools/hashtags', { topic: 'suya street food', category: 'Food', region: 'Nigeria' })} disabled={!!toolLoading}>
            {toolLoading === '/api/ai/tools/hashtags' ? 'Generating…' : 'Generate Hashtags'}
          </Button>
          <Button size="sm" onClick={() => callTool('/api/ai/tools/coach', { focus: 'grow audience in West Africa', platform: 'short-form video' })} disabled={!!toolLoading}>
            {toolLoading === '/api/ai/tools/coach' ? 'Generating…' : 'Creator Coach'}
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => clearMutation.mutate()}
          disabled={clearMutation.isPending || messages.length === 0}
          aria-label="Clear chat"
        >
          {clearMutation.isPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Trash2 className="text-muted-foreground" />
          )}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close KC Earn AI">
          <X />
        </Button>
      </header>

      <Conversation className="flex-1">
        <ConversationContent className="gap-4 px-4 py-4">
          {messages.length === 0 ? (
            <WelcomeScreen onPick={submit} />
          ) : (
            messages.map((message) => {
              const text = message.parts
                .map((part) => (part.type === "text" ? part.text : ""))
                .join("");
              if (!text) return null;
              return (
                <Message key={message.id} from={message.role}>
                  <MessageContent
                    className={
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-transparent p-0 text-foreground"
                    }
                  >
                    <MessageResponse>{text}</MessageResponse>
                  </MessageContent>
                </Message>
              );
            })
          )}
          {status === "submitted" ? (
            <Shimmer className="px-1 text-sm">KC Earn AI is thinking...</Shimmer>
          ) : null}
          {error ? (
            <p className="px-1 text-sm text-destructive">
              Something went wrong. Send your message again.
            </p>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-border p-3">
        <PromptInput
          onSubmit={(message) => submit(message.text ?? input)}
          className="rounded-2xl border-border bg-surface"
        >
          <PromptInputTextarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask KC Earn AI for ideas, captions or growth tips…"
          />
          <PromptInputFooter className="justify-end border-none">
            <PromptInputSubmit status={status} disabled={!input.trim() && !busy} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

export function KcEarnAiPanel({ onClose }: { onClose: () => void }) {
  const { user, loading } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["ai-history", user?.id],
    queryFn: () => loadAiHistory(),
    enabled: Boolean(user),
    staleTime: Infinity,
  });

  if (loading || (user && isLoading)) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="size-6 animate-spin text-brand" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <img src={aiLogo} alt="KC Earn AI" width={512} height={512} className="size-16" />
        <h2 className="text-lg font-bold">KC Earn AI – Your Smart Creator Assistant</h2>
        <p className="text-sm text-brand">Create. Share. Earn. Powered by AI.</p>
        <p className="text-sm text-muted-foreground">
          Sign in to chat with KC Earn AI and keep your conversation saved.
        </p>
        <Button asChild onClick={onClose}>
          <Link to="/auth">Sign in</Link>
        </Button>
      </div>
    );
  }

  const initialMessages: UIMessage[] = (data ?? []).map((row) => ({
    id: row.id,
    role: row.role,
    parts: [{ type: "text", text: row.text }],
  }));

  return (
    <ChatPanel
      key={user.id}
      userId={user.id}
      initialMessages={initialMessages}
      onClose={onClose}
    />
  );
}
