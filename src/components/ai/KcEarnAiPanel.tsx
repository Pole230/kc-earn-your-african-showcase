import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, Trash2, Volume2, X } from "lucide-react";
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

type AiPreferences = Record<string, string>;

function prepareSpeech() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.resume();
}

function speakText(text: string): SpeechSynthesisUtterance | null {
  if (typeof window === "undefined" || !window.speechSynthesis || !text.trim()) return null;
  prepareSpeech();
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
  return utterance;
}

function speakWelcome(text: string): SpeechSynthesisUtterance | null {
  return speakText(text);
}

function WelcomeScreen({
  onPick,
  displayName,
}: {
  onPick: (text: string) => void;
  displayName: string;
}) {
  const welcome = `Welcome to KC Earn, ${displayName}. KC Earn helps you create, share, and earn from your videos. KC Telecom and KC Messaging are part of the ecosystem; other KC products are coming soon.`;

  useEffect(() => {
    const utterance = speakWelcome(
      `Welcome to KC Earn, ${displayName}. KC Earn helps you create, share, and earn from your videos. KC Telecom and KC Messaging are part of the ecosystem; other KC products are coming soon.`,
    );
    if (!utterance) return;

    let started = false;
    const removeFallbackListeners = () => {
      document.removeEventListener("pointerdown", retrySpeech, true);
      document.removeEventListener("keydown", retrySpeech, true);
      document.removeEventListener("touchstart", retrySpeech, true);
    };
    const retrySpeech = () => {
      if (started) return;
      speakWelcome(welcome);
      removeFallbackListeners();
    };
    utterance.onstart = () => {
      started = true;
      removeFallbackListeners();
    };
    document.addEventListener("pointerdown", retrySpeech, true);
    document.addEventListener("keydown", retrySpeech, true);
    document.addEventListener("touchstart", retrySpeech, true);

    return () => {
      removeFallbackListeners();
      window.speechSynthesis?.cancel();
    };
  }, [displayName, welcome]);

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
      <p className="mt-3 max-w-sm text-sm text-muted-foreground">{welcome}</p>
      <div className="mt-6 grid w-full gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => {
              speakWelcome(welcome);
              onPick(suggestion);
            }}
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
  prefs,
  refetchPrefs,
  displayName,
}: {
  userId: string;
  initialMessages: UIMessage[];
  onClose: () => void;
  prefs: AiPreferences;
  refetchPrefs: () => void;
  displayName: string;
}) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const speechPendingRef = useRef(false);
  const spokenMessageIdsRef = useRef(new Set<string>());

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

  useEffect(() => {
    const initializeSpeech = () => prepareSpeech();
    document.addEventListener("pointerdown", initializeSpeech, { passive: true });
    document.addEventListener("keydown", initializeSpeech);
    document.addEventListener("touchstart", initializeSpeech, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", initializeSpeech);
      document.removeEventListener("keydown", initializeSpeech);
      document.removeEventListener("touchstart", initializeSpeech);
    };
  }, []);

  useEffect(() => {
    if (status !== "ready" || !speechPendingRef.current) return;
    const assistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");
    if (!assistantMessage || spokenMessageIdsRef.current.has(assistantMessage.id)) return;

    const responseText = assistantMessage.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("")
      .trim();
    if (!responseText) return;

    speechPendingRef.current = false;
    spokenMessageIdsRef.current.add(assistantMessage.id);
    speakText(responseText);
  }, [messages, status]);

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
    speechPendingRef.current = true;
    prepareSpeech();
    setInput("");
    void sendMessage({ text: value });
  };

  // Tool helpers
  const [toolLoading, setToolLoading] = useState<null | string>(null);

  async function callTool(endpoint: string, payload: object) {
    setToolLoading(endpoint);
    speechPendingRef.current = true;
    prepareSpeech();
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await response.text());
      if (!response.body) throw new Error("AI tool returned an empty response");

      let assistantMessage: UIMessage | undefined;
      const stream = readUIMessageStream<UIMessage>({
        stream: response.body as ReadableStream<UIMessageChunk>,
        terminateOnError: true,
      });
      for await (const message of stream) assistantMessage = message;
      if (!assistantMessage) throw new Error("AI tool returned no response");
      setMessages((current) => [...current, assistantMessage]);
      const responseText = assistantMessage.parts
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("")
        .trim();
      if (responseText) {
        speechPendingRef.current = false;
        spokenMessageIdsRef.current.add(assistantMessage.id);
        speakText(responseText);
      }

      await queryClient.invalidateQueries({ queryKey: ["ai-history", userId] });
    } catch (err: unknown) {
      console.error("[kc-earn-ai] tool error", err);
      toast.error(err instanceof Error ? err.message : "Tool error");
    } finally {
      setToolLoading(null);
    }
  }

  // Preferences save
  const [localPrefs, setLocalPrefs] = useState<AiPreferences>(prefs ?? {});
  useEffect(() => setLocalPrefs(prefs ?? {}), [prefs]);
  const [savingPrefs, setSavingPrefs] = useState(false);

  async function savePreferences() {
    setSavingPrefs(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/ai/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(localPrefs),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to save preferences");
      }
      toast.success("Preferences saved");
      refetchPrefs();
    } catch (err: unknown) {
      console.error("[kc-earn-ai] save prefs error", err);
      toast.error(err instanceof Error ? err.message : "Failed to save preferences");
    } finally {
      setSavingPrefs(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start gap-3 border-b border-border px-4 py-3">
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

          {/* Preferences summary */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>AI Preferences:</span>
            <span className="rounded-md bg-muted px-2 py-1 text-[11px]">
              {localPrefs.preferred_language ?? "Language: any"}
            </span>
            <span className="rounded-md bg-muted px-2 py-1 text-[11px]">
              {localPrefs.content_category ?? "Category: any"}
            </span>
            <span className="rounded-md bg-muted px-2 py-1 text-[11px]">
              {localPrefs.audience ?? "Audience: any"}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() =>
              callTool("/api/ai/tools/title", { topic: "Lagos street food", category: "Food" })
            }
            disabled={!!toolLoading}
          >
            {toolLoading === "/api/ai/tools/title" ? "Generating…" : "Generate Title"}
          </Button>
          <Button
            size="sm"
            onClick={() =>
              callTool("/api/ai/tools/caption", {
                description: "Vendor making suya with spices",
                mood: "excited",
              })
            }
            disabled={!!toolLoading}
          >
            {toolLoading === "/api/ai/tools/caption" ? "Generating…" : "Create Caption"}
          </Button>
          <Button
            size="sm"
            onClick={() =>
              callTool("/api/ai/tools/hashtags", {
                topic: "suya street food",
                category: "Food",
                region: "Nigeria",
              })
            }
            disabled={!!toolLoading}
          >
            {toolLoading === "/api/ai/tools/hashtags" ? "Generating…" : "Generate Hashtags"}
          </Button>
          <Button
            size="sm"
            onClick={() =>
              callTool("/api/ai/tools/coach", {
                focus: "grow audience in West Africa",
                platform: "short-form video",
              })
            }
            disabled={!!toolLoading}
          >
            {toolLoading === "/api/ai/tools/coach" ? "Generating…" : "Creator Coach"}
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

      {/* Preferences panel */}
      <div className="border-b border-border px-4 py-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs text-muted-foreground">Language</label>
            <select
              value={localPrefs.preferred_language ?? ""}
              onChange={(e) => setLocalPrefs((p) => ({ ...p, preferred_language: e.target.value }))}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">Any</option>
              <option value="English">English</option>
              <option value="Pidgin">Pidgin</option>
              <option value="Swahili">Swahili</option>
              <option value="French">French</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Content category</label>
            <select
              value={localPrefs.content_category ?? ""}
              onChange={(e) => setLocalPrefs((p) => ({ ...p, content_category: e.target.value }))}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">Any</option>
              <option value="Comedy">Comedy</option>
              <option value="Food">Food</option>
              <option value="Music">Music</option>
              <option value="Education">Education</option>
              <option value="Lifestyle">Lifestyle</option>
              <option value="Business">Business</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Audience</label>
            <select
              value={localPrefs.audience ?? ""}
              onChange={(e) => setLocalPrefs((p) => ({ ...p, audience: e.target.value }))}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">Any</option>
              <option value="Nigeria">Nigeria</option>
              <option value="Africa">Africa</option>
              <option value="Global">Global</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Creator style</label>
            <select
              value={localPrefs.creator_style ?? ""}
              onChange={(e) => setLocalPrefs((p) => ({ ...p, creator_style: e.target.value }))}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">Any</option>
              <option value="Funny">Funny</option>
              <option value="Professional">Professional</option>
              <option value="Emotional">Emotional</option>
              <option value="Educational">Educational</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Caption tone</label>
            <select
              value={localPrefs.caption_tone ?? ""}
              onChange={(e) => setLocalPrefs((p) => ({ ...p, caption_tone: e.target.value }))}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">Any</option>
              <option value="Viral">Viral</option>
              <option value="Simple">Simple</option>
              <option value="Storytelling">Storytelling</option>
            </select>
          </div>

          <div className="flex items-end">
            <Button onClick={savePreferences} disabled={savingPrefs}>
              {savingPrefs ? "Saving…" : "Save preferences"}
            </Button>
            <Button variant="ghost" onClick={() => setLocalPrefs(prefs ?? {})} className="ml-2">
              Reset
            </Button>
          </div>
        </div>
      </div>

      <Conversation className="flex-1">
        <ConversationContent className="gap-4 px-4 py-4">
          {messages.length === 0 ? (
            <WelcomeScreen onPick={submit} displayName={displayName} />
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
                    {message.role === "assistant" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => speakText(text)}
                        aria-label="Read response aloud"
                        title="Read response aloud"
                      >
                        <Volume2 className="size-4" />
                      </Button>
                    ) : null}
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

  const {
    data: prefs,
    isLoading: prefsLoading,
    refetch: refetchPrefs,
  } = useQuery({
    queryKey: ["ai-prefs", user?.id],
    queryFn: async () => {
      if (!user) return {} as AiPreferences;
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch("/api/ai/preferences", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return {};
      return (await res.json()) as AiPreferences;
    },
    enabled: Boolean(user),
    staleTime: Infinity,
  });

  if (loading || (user && isLoading) || prefsLoading) {
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
      prefs={prefs ?? {}}
      refetchPrefs={() => refetchPrefs()}
      displayName={String(
        user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? "creator",
      )}
    />
  );
}
