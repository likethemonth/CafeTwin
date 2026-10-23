// Scroll-locked video hero. Adapted from "scroll-locked-video-hero" by
// Guglielmo Giannattasio (https://21st.dev/@gughigug, guglielmogiannattasio.it).
//
// Wheel/touch/keyboard input scrubs the video instead of scrolling while the
// hero sits at the top of its scroll container. Unlike the original (which
// pins <body> forever), the lock releases once the video reaches its end so
// the page continues, and re-engages when the user scrolls back to the top.
// Text "beats" fade in and out at fixed points of scrub progress.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";

export interface HeroBeat {
  /** Progress window [from, to] in 0–1 during which the beat is visible. */
  from: number;
  to: number;
  kicker?: string;
  text: ReactNode;
  sub?: ReactNode;
}

export interface ScrollLockedVideoHeroProps {
  videoSrc: string;
  /** Element that scrolls the page. The hero must be its first child. */
  scrollerRef: RefObject<HTMLElement>;
  eyebrow?: string;
  title: ReactNode;
  beats?: HeroBeat[];
  tagline?: ReactNode;
  scrollHint?: string;
  /** Input distance (px) needed to scrub the whole video. */
  scrubDistance?: number;
  /** Rendered in the top-right corner (e.g. a skip link). */
  corner?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const COL_BG = "#05080f";
const COL_TEXT = "#f2f4f8";
const FADE = 0.05;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/** 0→1→0 envelope across [from, to] with soft edges. */
function envelope(p: number, from: number, to: number) {
  return clamp((p - from) / FADE, 0, 1) * clamp((to - p) / FADE, 0, 1);
}

export default function ScrollLockedVideoHero({
  videoSrc,
  scrollerRef,
  eyebrow,
  title,
  beats = [],
  tagline,
  scrollHint = "SCROLL",
  scrubDistance = 3200,
  corner,
  className,
  style,
}: ScrollLockedVideoHeroProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const taglineRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const beatRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [ready, setReady] = useState(false);
  const [reduceMotion] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const video = videoRef.current;
    const section = sectionRef.current;
    const scroller = scrollerRef.current;
    if (!video || !section || !scroller) return;

    let duration = 0;
    let rafId = 0;
    let targetProgress = 0;
    let currentProgress = 0;
    let hasStartedScrolling = false;
    let isSeeking = false;
    let pendingTime: number | null = null;
    let touchStartY = 0;

    const onLoadedData = () => {
      duration = video.duration || 0;
      setReady(true);
      if (reduceMotion) video.currentTime = duration * 0.92;
    };
    video.addEventListener("loadeddata", onLoadedData);
    if (video.readyState >= 2) onLoadedData();

    // iOS Safari may not buffer until playback starts; play-then-pause once.
    const p = video.play();
    if (p && typeof p.then === "function") p.then(() => video.pause()).catch(() => {});

    const onSeeked = () => {
      isSeeking = false;
      if (pendingTime !== null) {
        const t = pendingTime;
        pendingTime = null;
        isSeeking = true;
        video.currentTime = t;
      }
    };
    video.addEventListener("seeked", onSeeked);

    function seekTo(t: number) {
      if (Math.abs(video!.currentTime - t) < 1 / 60) return;
      if (isSeeking) {
        pendingTime = t;
        return;
      }
      isSeeking = true;
      video!.currentTime = t;
    }

    /** True while scroll input should scrub the video rather than move the page. */
    function captures(deltaY: number) {
      if (reduceMotion) return false;
      if (scroller!.scrollTop > 1) return false;
      if (deltaY > 0) return !(targetProgress >= 1 && currentProgress > 0.985);
      if (deltaY < 0) return targetProgress > 0;
      return false;
    }

    function addDelta(deltaY: number) {
      targetProgress = clamp(targetProgress + deltaY / scrubDistance, 0, 1);
      if (targetProgress > 0.001) hasStartedScrolling = true;
    }

    const onWheel = (e: WheelEvent) => {
      if (!captures(e.deltaY)) return;
      e.preventDefault();
      addDelta(e.deltaY);
    };

    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? 0;
    };
    // The hero sets touch-action:none, so released touches scroll the page manually.
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? touchStartY;
      const deltaY = touchStartY - y;
      touchStartY = y;
      if (captures(deltaY)) {
        e.preventDefault();
        addDelta(deltaY * 1.6);
      } else if (section.contains(e.target as Node)) {
        e.preventDefault();
        scroller.scrollTop += deltaY;
      }
    };

    const KEY_DELTA: Record<string, number> = { ArrowDown: 140, ArrowUp: -140, PageDown: 600, PageUp: -600, " ": 600 };
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, a")) return;
      const d = KEY_DELTA[e.key] != null ? (e.shiftKey && e.key === " " ? -600 : KEY_DELTA[e.key]) : 0;
      if (!d || !captures(d)) return;
      e.preventDefault();
      addDelta(d);
    };

    scroller.addEventListener("wheel", onWheel, { passive: false });
    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKey);

    function frame() {
      currentProgress += (targetProgress - currentProgress) * 0.18;
      if (Math.abs(targetProgress - currentProgress) < 0.0005) currentProgress = targetProgress;
      const cp = currentProgress;

      if (duration > 0) seekTo(cp * duration * 0.999);
      video!.style.transform = `scale(${1 + cp * 0.08})`;

      if (titleRef.current) {
        const t = 1 - clamp(cp / 0.18, 0, 1);
        titleRef.current.style.opacity = String(t);
        titleRef.current.style.transform = `translateY(${(1 - t) * -24}px) scale(${0.96 + t * 0.04})`;
        titleRef.current.style.filter = `blur(${(1 - t) * 10}px)`;
      }
      beats.forEach((b, i) => {
        const el = beatRefs.current[i];
        if (!el) return;
        const t = envelope(cp, b.from, b.to);
        el.style.opacity = String(t);
        el.style.transform = `translateY(${(1 - t) * 18}px)`;
        el.style.filter = `blur(${(1 - t) * 8}px)`;
      });
      if (hintRef.current) hintRef.current.style.opacity = hasStartedScrolling ? "0" : "1";
      if (taglineRef.current) {
        const t = clamp((cp - 0.86) / 0.12, 0, 1);
        taglineRef.current.style.opacity = String(t);
        taglineRef.current.style.transform = `translateY(${(1 - t) * 20}px) scale(${0.97 + t * 0.03})`;
        taglineRef.current.style.filter = `blur(${(1 - t) * 8}px)`;
      }
      if (progressBarRef.current) progressBarRef.current.style.transform = `scaleX(${cp})`;

      rafId = requestAnimationFrame(frame);
    }
    if (!reduceMotion) rafId = requestAnimationFrame(frame);

    return () => {
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("seeked", onSeeked);
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(rafId);
    };
    // beats are static content; their count is what the loop depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrubDistance, scrollerRef, beats.length, reduceMotion]);

  const layer: CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: "0 8%",
    textAlign: "center",
    pointerEvents: "none",
  };
  const shadow = "0 4px 30px rgba(0,0,0,0.6)";

  return (
    <div
      ref={sectionRef}
      className={className}
      style={{
        position: "relative",
        height: "100dvh",
        width: "100%",
        overflow: "hidden",
        background: COL_BG,
        touchAction: "none",
        ...style,
      }}
    >
      <video
        ref={videoRef}
        src={videoSrc}
        muted
        playsInline
        preload="auto"
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: ready ? 1 : 0,
          transformOrigin: "center center",
          willChange: "transform",
          transition: "opacity 0.6s ease",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, rgba(5,8,15,0.25) 0%, rgba(5,8,15,0.7) 75%), linear-gradient(180deg, rgba(5,8,15,0.5), rgba(5,8,15,0) 30%, rgba(5,8,15,0.2) 70%, rgba(5,8,15,0.85))",
          pointerEvents: "none",
        }}
      />

      <div ref={titleRef} style={layer}>
        {eyebrow && (
          <span style={{ fontFamily: "var(--mono)", fontSize: "clamp(10px, 1.3vw, 13px)", letterSpacing: "0.3em", color: "var(--cyan)", textTransform: "uppercase" }}>
            {eyebrow}
          </span>
        )}
        <span
          style={{
            fontWeight: 800,
            fontSize: "clamp(40px, 9vw, 120px)",
            lineHeight: 1,
            letterSpacing: "-0.03em",
            color: COL_TEXT,
            textShadow: shadow,
            willChange: "transform, filter, opacity",
          }}
        >
          {title}
        </span>
      </div>

      {beats.map((b, i) => (
        <div
          key={i}
          ref={(el) => {
            beatRefs.current[i] = el;
          }}
          style={{ ...layer, opacity: 0 }}
        >
          {b.kicker && (
            <span style={{ fontFamily: "var(--mono)", fontSize: "clamp(10px, 1.2vw, 12px)", letterSpacing: "0.28em", color: "var(--cyan)", textTransform: "uppercase" }}>
              {b.kicker}
            </span>
          )}
          <span style={{ fontWeight: 750, fontSize: "clamp(26px, 4.6vw, 60px)", lineHeight: 1.08, letterSpacing: "-0.02em", color: COL_TEXT, textShadow: shadow, maxWidth: 980 }}>
            {b.text}
          </span>
          {b.sub && (
            <span style={{ fontSize: "clamp(14px, 1.6vw, 19px)", lineHeight: 1.45, color: "rgba(229,234,243,0.82)", textShadow: shadow, maxWidth: 640 }}>
              {b.sub}
            </span>
          )}
        </div>
      ))}

      {tagline && (
        <div ref={taglineRef} style={{ ...layer, opacity: reduceMotion ? 1 : 0 }}>
          <span style={{ fontWeight: 700, fontSize: "clamp(22px, 3.6vw, 44px)", lineHeight: 1.2, letterSpacing: "-0.01em", color: COL_TEXT, textShadow: shadow, maxWidth: 900 }}>
            {tagline}
          </span>
        </div>
      )}

      <div
        ref={hintRef}
        style={{
          position: "absolute",
          left: "50%",
          bottom: "clamp(20px, 6vh, 48px)",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          color: "rgba(240,244,248,0.75)",
          fontFamily: "var(--mono)",
          fontSize: "clamp(10px, 1.4vw, 12px)",
          fontWeight: 600,
          letterSpacing: "0.3em",
          transition: "opacity 0.4s ease",
          pointerEvents: "none",
        }}
      >
        <span>{scrollHint}</span>
        <svg width="14" height="18" viewBox="0 0 14 18" style={{ animation: "slvh-bounce 1.6s ease-in-out infinite" }}>
          <style>{`@keyframes slvh-bounce { 0%, 100% { transform: translateY(0); opacity: .5 } 50% { transform: translateY(5px); opacity: 1 } }`}</style>
          <path d="M7 1 L7 17 M2 12 L7 17 L12 12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {corner && <div style={{ position: "absolute", top: "clamp(12px, 2.5vw, 24px)", right: "clamp(12px, 2.5vw, 24px)", zIndex: 2 }}>{corner}</div>}

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, background: "rgba(255,255,255,0.1)" }}>
        <div
          ref={progressBarRef}
          style={{
            height: "100%",
            width: "100%",
            background: "linear-gradient(90deg, rgba(34,211,238,0.5), rgba(59,130,246,0.95))",
            transform: reduceMotion ? "scaleX(1)" : "scaleX(0)",
            transformOrigin: "left center",
          }}
        />
      </div>
    </div>
  );
}
