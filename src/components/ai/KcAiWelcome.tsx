import React, { useEffect, useRef, useState } from "react";

export type KcAiWelcomeProps = {
  text?: string;
  voiceName?: string | null;
  onFinish?: () => void;
};

// A reusable KC AI welcome component that speaks (TTS fallback), shows captions,
// and animates the avatar (lip movement + blinking). No external credentials required.
export function KcAiWelcome({
  text = `Welcome to the KC Organization.\nI am KC AI, your personal intelligent assistant.\nI will guide you through every KC service, help you earn, learn, create, invest, and grow.\nEverything you need is available here, and I will always be with you whenever you need assistance.\nWe are excited to have you with us.\nWelcome to the KC family.`,
  voiceName = null,
  onFinish,
}: KcAiWelcomeProps) {
  const [playing, setPlaying] = useState(false);
  const mouthRef = useRef<HTMLDivElement | null>(null);
  const blinkRef = useRef<HTMLDivElement | null>(null);
  const [caption, setCaption] = useState<string>(text.replace(/\\n/g, " \u2014 "));

  useEffect(() => {
    let cancelled = false;
    // simple blink animation interval
    const blinkInterval = setInterval(() => {
      if (blinkRef.current) {
        blinkRef.current.style.opacity = "0";
        setTimeout(() => {
          if (blinkRef.current) blinkRef.current.style.opacity = "1";
        }, 150);
      }
    }, 4000 + Math.random() * 2000);

    // Mouth animation timer (approximate)
    let mouthTimer: number | undefined;

    function stopAll() {
      clearInterval(blinkInterval);
      if (mouthTimer) clearInterval(mouthTimer);
    }

    async function speakWithFallback() {
      // If premium AI TTS is configured in the host app, it should call the component with an audio blob/url.
      // Here we use the browser SpeechSynthesis API as a reliable fallback.
      if (typeof window === "undefined") {
        // SSR: no-op and finish quickly
        onFinish?.();
        return;
      }

      const synth = (window as any).speechSynthesis;
      if (!synth) {
        // No TTS support; show captions for a moment then finish
        setPlaying(true);
        await new Promise((r) => setTimeout(r, Math.min(4000 + caption.length * 40, 20000)));
        setPlaying(false);
        onFinish?.();
        return;
      }

      // Try to pick a voice if a voiceName was provided
      let voice: SpeechSynthesisVoice | undefined;
      const loadVoices = () =>
        new Promise<void>((resolve) => {
          const voices = synth.getVoices();
          if (voices.length) {
            resolve();
            return;
          }
          const onVoices = () => {
            synth.removeEventListener("voiceschanged", onVoices);
            resolve();
          };
          synth.addEventListener("voiceschanged", onVoices);
          setTimeout(() => resolve(), 1000);
        });

      await loadVoices();
      try {
        const voices = synth.getVoices();
        if (voiceName) voice = voices.find((v) => v.name === voiceName) ?? undefined;
        // Fallback choose a natural-sounding voice if available
        if (!voice) voice = voices.find((v) => /female|alice|emily|sara|joanna|susan/i.test(v.name)) ?? voices[0];
      } catch (e) {
        // ignore
      }

      const utter = new SpeechSynthesisUtterance(text.replace(/\\n/g, " "));
      if (voice) utter.voice = voice;
      utter.rate = 1.0;
      utter.pitch = 1.0;

      utter.onstart = () => {
        if (cancelled) return;
        setPlaying(true);
        // start mouth animation: vary scaleY based on a pseudo-random function
        let t = 0;
        mouthTimer = window.setInterval(() => {
          t++;
          const amp = Math.abs(Math.sin(t / 3)) * 0.5 + 0.6;
          if (mouthRef.current) mouthRef.current.style.transform = `scaleY(${amp})`;
        }, 120) as unknown as number;
      };

      utter.onend = () => {
        stopAll();
        setPlaying(false);
        onFinish?.();
      };

      utter.onerror = () => {
        stopAll();
        setPlaying(false);
        onFinish?.();
      };

      try {
        synth.cancel();
      } catch {}
      try {
        synth.speak(utter);
      } catch (e) {
        // speak may throw in some browsers — fallback to timeout
        setTimeout(() => {
          stopAll();
          setPlaying(false);
          onFinish?.();
        }, Math.min(4000 + caption.length * 40, 20000));
      }

      return () => {
        cancelled = true;
        stopAll();
        try {
          synth.cancel();
        } catch {}
      };
    }

    const cleanupPromise = speakWithFallback();

    return () => {
      cancelled = true;
      stopAll();
      try {
        (window as any).speechSynthesis?.cancel();
      } catch {}
    };
  }, [text, voiceName, caption, onFinish]);

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="KC AI Welcome"
      className="fixed inset-0 z-[9999] grid place-items-center bg-background/90 p-6 backdrop-blur-sm"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <div className="mx-auto w-full max-w-md transform overflow-hidden rounded-3xl bg-surface p-6 shadow-2xl transition-all">
        <div className="flex items-center gap-4">
          <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand to-purple-600">
            {/* Avatar face */}
            <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="h-3 w-12 rounded-full bg-white/90" style={{ marginBottom: 8 }} />
              <div ref={mouthRef} className="h-3 w-8 rounded-full bg-black/90 transform origin-center transition-transform" />
            </div>
            {/* Blinking eye overlay for subtle movement */}
            <div
              ref={blinkRef}
              className="absolute inset-0"
              style={{ pointerEvents: "none", opacity: 1, transition: "opacity 120ms" }}
            />
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">Welcome to KC</h2>
            <p className="mt-1 text-sm text-muted-foreground">KC AI is preparing a short welcome for you</p>
          </div>
        </div>

        <div className="mt-4 flex min-h-[84px] items-center">
          <div className="prose max-w-none text-sm text-foreground">
            <p aria-live="polite" className="whitespace-pre-wrap">
              {caption}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <div>{playing ? "Speaking…" : "Preparing…"}</div>
          <div className="font-medium">KC AI</div>
        </div>
      </div>
    </div>
  );
}
