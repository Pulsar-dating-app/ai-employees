"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { M } from "./landing-icons";
import { CascadeText } from "./cascade-text";
import anaImg from "../../../public/agents/secretary-1.png";

const SRC = "/landing-v2/video/ana-agenda.mp4";
const POSTER = "/landing-v2/video/ana-agenda-poster.jpg";

type Mode = "idle" | "preview" | "playing" | "paused" | "ended";

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function quietMotion() {
  if (typeof window === "undefined") return true;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  return reduced || saveData;
}

export function VideoSpotlight({ hireHref }: { hireHref: string }) {
  const t = useTranslations("LandingV2.video");
  const tHero = useTranslations("LandingV2.hero");
  const tValue = useTranslations("LandingV2.value");
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [muted, setMuted] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const touched = useRef(false);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const quiet = quietMotion();
    const arm = quiet ? 0 : requestAnimationFrame(() => setArmed(true));
    const view = new IntersectionObserver(
      ([entry]) => {
        const video = videoRef.current;
        if (entry.isIntersecting) setShown(true);
        if (!video || quiet || touched.current) return;
        if (entry.intersectionRatio >= 0.5) {
          video.muted = true;
          video.play().then(() => setMode("preview")).catch(() => {});
        } else if (!video.paused) {
          video.pause();
          setMode("idle");
        }
      },
      { threshold: [0, 0.5] },
    );
    view.observe(node);
    return () => {
      cancelAnimationFrame(arm);
      view.disconnect();
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || (mode !== "playing" && mode !== "preview")) return;
    let raf = 0;
    const tick = () => {
      setTime(video.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  const playWithSound = useCallback((restart: boolean) => {
    const video = videoRef.current;
    if (!video) return;
    touched.current = true;
    if (restart) video.currentTime = 0;
    video.muted = false;
    setMuted(false);
    video.play().then(() => setMode("playing")).catch(() => {
      video.muted = true;
      setMuted(true);
      video.play().then(() => setMode("playing")).catch(() => {});
    });
  }, []);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (mode === "idle" || mode === "preview" || mode === "ended") {
      playWithSound(mode !== "idle" || video.currentTime > 0);
      return;
    }
    touched.current = true;
    if (video.paused) {
      video.play().then(() => setMode("playing")).catch(() => {});
    } else {
      video.pause();
      setMode("paused");
    }
  }, [mode, playWithSound]);

  const toggleSound = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (mode === "preview" || mode === "idle") {
      playWithSound(true);
      return;
    }
    video.muted = !video.muted;
    setMuted(video.muted);
  }, [mode, playWithSound]);

  const seekTo = useCallback(
    (ratio: number) => {
      const video = videoRef.current;
      if (!video || !duration) return;
      touched.current = true;
      video.currentTime = Math.min(Math.max(ratio, 0), 1) * duration;
      setTime(video.currentTime);
      if (mode === "ended") setMode("paused");
    },
    [duration, mode],
  );

  const onSeekPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo((e.clientX - rect.left) / rect.width);
  };

  const onSeekKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!duration) return;
    const step = e.shiftKey ? 10 : 5;
    if (e.key === "ArrowRight") seekTo((time + step) / duration);
    else if (e.key === "ArrowLeft") seekTo((time - step) / duration);
    else if (e.key === "Home") seekTo(0);
    else if (e.key === "End") seekTo(0.999);
    else return;
    e.preventDefault();
  };

  const pct = duration ? (time / duration) * 100 : 0;
  const showBigPlay = mode === "idle" || mode === "paused";
  const showSoundPill = mode === "preview" || (mode === "playing" && muted);

  return (
    <section id="video" className="lv2-video relative isolate w-full overflow-hidden bg-[#0b0a24] py-16 text-white sm:py-20">
      <style>{`
        @property --lv2-spot { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
        .lv2-video ::selection { background: rgba(165,180,252,0.45); color: #fff; }
        .lv2-spot-ring {
          background: conic-gradient(from var(--lv2-spot), rgba(165,180,252,0.08) 0deg, rgba(165,180,252,0.08) 230deg, #a5b4fc 300deg, #67e8f9 330deg, rgba(165,180,252,0.08) 360deg);
        }
        .lv2-spot-frame {
          transition: transform 1.4s cubic-bezier(0.16,1,0.3,1), filter 1.4s cubic-bezier(0.16,1,0.3,1), opacity 1s cubic-bezier(0.16,1,0.3,1);
        }
        .lv2-spot-frame[data-armed="true"][data-shown="false"] { transform: translateY(48px) scale(0.94); filter: blur(14px); opacity: 0.35; }
        @media (prefers-reduced-motion: no-preference) {
          .lv2-spot-ring { animation: lv2-spot-turn 7s linear infinite; }
          .lv2-play-pulse { animation: lv2-play-pulse 2.4s cubic-bezier(0.16,1,0.3,1) infinite; }
        }
        @keyframes lv2-spot-turn { to { --lv2-spot: 360deg; } }
        @keyframes lv2-play-pulse { 0% { transform: scale(1); opacity: 0.55; } 100% { transform: scale(1.7); opacity: 0; } }
      `}</style>

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[38%] h-[720px] w-[1100px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(79,70,229,0.42),rgba(79,70,229,0))]" />
        <div className="absolute bottom-[-180px] right-[-120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(0,101,145,0.35),rgba(0,101,145,0))]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_45%,black,transparent)]" />
      </div>

      <div className="mx-auto max-w-[1180px] px-4 md:px-10">
        <div className="mx-auto max-w-[44rem] text-center">
          <h2 className="text-balance text-[30px] font-bold leading-[36px] tracking-[-0.025em] text-white sm:text-[40px] sm:leading-[46px]">
            {t("heading")}
          </h2>
          <p className="mx-auto mt-3 max-w-[38rem] text-pretty text-[17px] leading-[27px] text-[#c9c6f2] sm:text-[18px] sm:leading-[28px]">
            {t("sub")}
          </p>
        </div>

        <div
          ref={frameRef}
          data-armed={armed}
          data-shown={shown}
          className="lv2-spot-frame relative mx-auto mt-8 max-w-[920px] sm:mt-10"
        >
          <div className="lv2-spot-ring absolute -inset-[1.5px] rounded-[26px] sm:rounded-[30px]" aria-hidden="true" />
          <div className="relative overflow-hidden rounded-[24px] bg-[#05041a] shadow-[0_50px_120px_-30px_rgba(79,70,229,0.65),0_24px_60px_-20px_rgba(0,0,0,0.6)] sm:rounded-[28px]">
            <video
              ref={videoRef}
              className="block aspect-video w-full cursor-pointer bg-[#05041a] object-cover"
              poster={POSTER}
              src={SRC}
              preload="none"
              playsInline
              muted={muted}
              aria-label={t("label")}
              onClick={toggle}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onEnded={() => setMode("ended")}
            />

            {showBigPlay ? (
              <button
                type="button"
                onClick={toggle}
                aria-label={mode === "paused" ? t("resume") : t("play")}
                className="group absolute inset-0 flex items-center justify-center bg-[radial-gradient(closest-side,rgba(11,10,36,0.35),rgba(11,10,36,0))] focus-visible:outline-none"
              >
                <span className="relative flex items-center gap-4 rounded-full bg-white p-2.5 text-[#3525cd] sm:py-3 sm:pl-3 sm:pr-7 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.55)] transition-transform duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04] group-focus-visible:ring-4 group-focus-visible:ring-white/60">
                  <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#3525cd] text-white sm:h-16 sm:w-16">
                    {mode === "idle" ? <span className="lv2-play-pulse absolute inset-0 rounded-full bg-[#4f46e5]" aria-hidden="true" /> : null}
                    <M name="play_arrow" size={28} className="relative translate-x-[1px]" />
                  </span>
                  <span className="hidden flex-col items-start text-left sm:flex">
                    <span className="text-[17px] font-semibold leading-tight sm:text-[19px]">{mode === "paused" ? t("resume") : t("play")}</span>
                    <span className="text-[13px] font-medium text-[#64748b]">{t("duration")}</span>
                  </span>
                </span>
              </button>
            ) : null}

            {showSoundPill ? (
              <button
                type="button"
                onClick={toggleSound}
                className="group absolute left-4 top-4 inline-flex items-center gap-2.5 rounded-full bg-white px-4 py-2.5 text-[14px] font-semibold text-[#3525cd] shadow-[0_14px_34px_-10px_rgba(0,0,0,0.55)] transition-transform duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60 sm:left-6 sm:top-6 sm:px-5 sm:py-3 sm:text-[15px]"
              >
                <M name="volume_up" size={19} />
                {t("soundOn")}
              </button>
            ) : null}

            {mode === "ended" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-[#0b0a24]/70 px-6 text-center backdrop-blur-md">
                <Image src={anaImg} alt="" sizes="72px" className="h-14 w-14 rounded-full object-cover ring-4 ring-white/90 sm:h-[72px] sm:w-[72px]" />
                <p className="text-balance text-[22px] font-bold leading-tight tracking-[-0.02em] text-white sm:text-[34px]">{t("endTitle")}</p>
                <p className="hidden text-[16px] text-[#c9c6f2] sm:block">{t("endSub")}</p>
                <div className="flex flex-col items-center gap-3 sm:flex-row">
                  <Link
                    href={hireHref}
                    aria-label={tHero("ctaPrimary")}
                    className="group inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-[15px] font-semibold text-[#3525cd] shadow-[0_18px_44px_-14px_rgba(0,0,0,0.6)] transition-transform duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
                  >
                    <CascadeText text={tHero("ctaPrimary")} />
                    <M name="arrow_forward" size={18} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => playWithSound(true)}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-[15px] font-semibold text-white/90 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
                  >
                    <M name="replay" size={18} />
                    {t("replay")}
                  </button>
                </div>
              </div>
            ) : null}

            {mode === "playing" || mode === "paused" ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#05041a]/85 via-[#05041a]/30 to-transparent px-3 pb-3 pt-10 sm:px-5 sm:pb-4">
                <div className="pointer-events-auto flex items-center gap-3 text-white">
                  <button
                    type="button"
                    onClick={toggle}
                    aria-label={mode === "playing" ? t("pause") : t("resume")}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <M name={mode === "playing" ? "pause" : "play_arrow"} size={18} />
                  </button>
                  <div
                    role="slider"
                    tabIndex={0}
                    aria-label={t("progress")}
                    aria-valuemin={0}
                    aria-valuemax={Math.round(duration)}
                    aria-valuenow={Math.round(time)}
                    aria-valuetext={`${clock(time)} / ${clock(duration)}`}
                    onPointerDown={onSeekPointer}
                    onKeyDown={onSeekKey}
                    className="group relative h-6 flex-1 cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/20 transition-[height] group-hover:h-1.5">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#a5b4fc] to-[#67e8f9]" style={{ width: `${pct}%` }} />
                    </div>
                    <div
                      className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                      style={{ left: `${pct}%` }}
                    />
                  </div>
                  <span className="hidden shrink-0 text-[13px] font-medium tabular-nums text-white/85 sm:block">
                    {clock(time)} / {clock(duration)}
                  </span>
                  <button
                    type="button"
                    onClick={toggleSound}
                    aria-label={muted ? t("soundOn") : t("soundOff")}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <M name={muted ? "volume_off" : "volume_up"} size={18} />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {t("languageNote") ? <p className="mt-4 text-center text-[13px] font-medium text-[#a9a6d6]">{t("languageNote")}</p> : null}

        <div className="mt-10 flex flex-col items-center gap-5 sm:mt-12">
          <div className="flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
            <Link
              href={hireHref}
              aria-label={tHero("ctaPrimary")}
              className={clsx(
                "group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-[16px] font-semibold text-[#3525cd] sm:w-auto",
                "shadow-[0_18px_50px_-14px_rgba(165,180,252,0.55)] transition-[transform,box-shadow] duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
                "hover:scale-[1.03] hover:shadow-[0_24px_60px_-12px_rgba(165,180,252,0.75)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60",
              )}
            >
              <CascadeText text={tHero("ctaPrimary")} />
              <M name="arrow_forward" size={18} />
            </Link>
            <a
              href="#planos"
              className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-4 text-[16px] font-semibold text-white/85 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              {tValue("cta")}
            </a>
          </div>
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[14px] font-medium text-[#c9c6f2]">
            {[tHero("trust1"), tHero("trust3")].map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <M name="check_circle" size={16} className="text-[#34d399]" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
