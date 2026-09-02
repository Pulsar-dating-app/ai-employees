"use client";

import { useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { XIcon } from "@/components/ui/icons";
import type { TourStep } from "./types";

const SPOTLIGHT_PADDING = 8;
const BALLOON_WIDTH = 320;
const BALLOON_GAP = 14;
const VIEWPORT_MARGIN = 12;
// Below this much vertical room, top/bottom placement would clip the
// balloon's own content -- a conservative floor, not a measured height,
// since the balloon's real height depends on how long the description is.
const MIN_VERTICAL_SPACE = 200;

type Rect = { top: number; left: number; width: number; height: number };
type Placement = "top" | "bottom" | "left" | "right";

function measure(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

// The balloon anchors to the target's on-screen edges, not its true edges --
// a target taller than the viewport (e.g. a whole grid section) has a real
// bottom edge far off-screen, and anchoring there would push the balloon
// almost entirely out of view. Clamping to the viewport first means "bottom"
// placement lands just past whatever's actually visible.
function clipToViewport(rect: Rect): Rect {
  const top = Math.max(rect.top, 0);
  const left = Math.max(rect.left, 0);
  const bottom = Math.min(rect.top + rect.height, window.innerHeight);
  const right = Math.min(rect.left + rect.width, window.innerWidth);
  return { top, left, width: Math.max(right - left, 0), height: Math.max(bottom - top, 0) };
}

function pickPlacement(rect: Rect): Placement {
  const spaceBelow = window.innerHeight - (rect.top + rect.height);
  const spaceAbove = rect.top;
  const spaceRight = window.innerWidth - (rect.left + rect.width);
  const spaceLeft = rect.left;

  if (spaceBelow >= MIN_VERTICAL_SPACE) return "bottom";
  if (spaceAbove >= MIN_VERTICAL_SPACE) return "top";
  if (spaceRight >= BALLOON_WIDTH + BALLOON_GAP) return "right";
  if (spaceLeft >= BALLOON_WIDTH + BALLOON_GAP) return "left";
  // Nothing has real room (a tiny viewport, or a target near every edge at
  // once) -- bottom is the least-bad default rather than refusing to render.
  return "bottom";
}

function clampHorizontal(left: number): number {
  return Math.min(Math.max(left, VIEWPORT_MARGIN), window.innerWidth - BALLOON_WIDTH - VIEWPORT_MARGIN);
}

// Horizontal position is computed directly (the balloon's width is fixed
// and known), so it can be clamped to the viewport in plain arithmetic.
// Vertical position for top/bottom placement instead leans on a CSS
// `transform: translateY(-100%)` for "top" -- the balloon's height is
// content-dependent (a longer description grows it), so letting the browser
// grow it upward from a fixed anchor point is simpler and more correct than
// estimating a height in JS.
function balloonStyle(rect: Rect, placement: Placement): CSSProperties {
  switch (placement) {
    case "bottom":
      return {
        top: rect.top + rect.height + BALLOON_GAP,
        left: clampHorizontal(rect.left + rect.width / 2 - BALLOON_WIDTH / 2),
        width: BALLOON_WIDTH,
      };
    case "top":
      return {
        top: rect.top - BALLOON_GAP,
        left: clampHorizontal(rect.left + rect.width / 2 - BALLOON_WIDTH / 2),
        width: BALLOON_WIDTH,
        transform: "translateY(-100%)",
      };
    case "right":
      return {
        top: rect.top + rect.height / 2,
        left: rect.left + rect.width + BALLOON_GAP,
        width: BALLOON_WIDTH,
        transform: "translateY(-50%)",
      };
    case "left":
      return {
        top: rect.top + rect.height / 2,
        left: rect.left - BALLOON_GAP,
        width: BALLOON_WIDTH,
        transform: "translate(-100%, -50%)",
      };
  }
}

// A small rotated square, same fill as the balloon, sitting on the edge
// that faces the spotlighted element -- the same "speech bubble tail"
// device the embed widget's own teaser bubble uses (public/widget.js).
function arrowStyle(placement: Placement): CSSProperties {
  const base: CSSProperties = {
    position: "absolute",
    width: 12,
    height: 12,
    transform: "rotate(45deg)",
  };
  switch (placement) {
    case "bottom":
      return { ...base, top: -6, left: "50%", marginLeft: -6 };
    case "top":
      return { ...base, bottom: -6, left: "50%", marginLeft: -6 };
    case "right":
      return { ...base, left: -6, top: "50%", marginTop: -6 };
    case "left":
      return { ...base, right: -6, top: "50%", marginTop: -6 };
  }
}

export function TourOverlay({
  step,
  stepIndex,
  totalSteps,
  onNext,
  onBack,
  onEnd,
  isLastStep,
}: {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onBack?: () => void;
  onEnd: () => void;
  isLastStep: boolean;
}) {
  const t = useTranslations("Tour");
  const [rect, setRect] = useState<Rect | null>(null);

  // Re-measures on every step change, and keeps the spotlight glued to the
  // target through scrolling/resizing in between steps -- a merchant
  // scrolling mid-tour shouldn't leave the spotlight pointing at empty space.
  useLayoutEffect(() => {
    function measureTarget() {
      const el = document.querySelector(step.target);
      setRect(el ? measure(el) : null);
    }

    // The scroll/resize handlers below are rAF-throttled -- a raw scroll
    // listener fires many times per animation frame during the `scrollIntoView`
    // smooth-scroll below, and each call was re-triggering a re-render of the
    // spotlight's 9999px-spread box-shadow (expensive to repaint) while its own
    // `transition-all` fought the next incoming value -- together, on a long
    // page, slow enough to visibly jank or stall the scroll animation.
    let ticking = false;
    function onScrollOrResize() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        measureTarget();
        ticking = false;
      });
    }

    measureTarget();
    const el = document.querySelector(step.target);
    // Always centers the target into view on a step change -- a small,
    // consistent nudge even when it's already visible, rather than
    // conditional logic to decide whether scrolling is "necessary".
    el?.scrollIntoView({ block: "center", behavior: "smooth" });

    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [step.target]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onEnd();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onEnd]);

  const visibleRect = rect ? clipToViewport(rect) : null;
  const placement = visibleRect ? pickPlacement(visibleRect) : "bottom";

  return createPortal(
    <div className="fixed inset-0 z-[1000]" role="dialog" aria-modal="true" aria-label={step.title}>
      {/* Blocks interaction with the rest of the page for the duration of
          the tour -- fully transparent itself; darkening comes entirely
          from the spotlight box's own shadow below, so there's no risk of
          the two disagreeing about where the "hole" is. */}
      <div className="absolute inset-0" />

      {rect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-lg ring-2 ring-primary-fixed-dim transition-all duration-300 ease-out"
          style={{
            top: rect.top - SPOTLIGHT_PADDING,
            left: rect.left - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
            boxShadow: "0 0 0 9999px rgba(15, 15, 20, 0.65)",
          }}
        />
      ) : (
        // Target not found in the DOM right now -- still dim the page
        // (consistency), just with no hole to cut, and the balloon below
        // falls back to centered instead of anchored to a rect that doesn't
        // exist.
        <div aria-hidden="true" className="absolute inset-0 bg-[rgba(15,15,20,0.65)]" />
      )}

      <div
        className={
          rect
            ? "fixed transition-all duration-300 ease-out"
            : "fixed inset-0 flex items-center justify-center p-4"
        }
        style={visibleRect ? balloonStyle(visibleRect, placement) : undefined}
      >
        <div
          className="relative rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-level2"
          style={rect ? undefined : { width: BALLOON_WIDTH }}
        >
          {rect ? (
            <div
              aria-hidden="true"
              className="border-outline-variant bg-surface-container-lowest"
              style={{
                ...arrowStyle(placement),
                borderWidth: placement === "bottom" || placement === "right" ? "1px 0 0 1px" : "0 1px 1px 0",
              }}
            />
          ) : null}

          <button
            type="button"
            onClick={onEnd}
            aria-label={t("close")}
            className="absolute right-3 top-3 rounded-full p-1 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <XIcon className="h-4 w-4" />
          </button>

          <span className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            {t("stepCounter", { current: stepIndex + 1, total: totalSteps })}
          </span>
          <h3 className="mt-1 pr-6 text-base font-semibold text-on-surface">{step.title}</h3>
          <p className="mt-1.5 text-sm text-on-surface-variant">{step.description}</p>

          <div className="mt-4 flex items-center justify-end gap-2">
            {onBack ? (
              <Button type="button" variant="ghost" size="sm" onClick={onBack}>
                {t("back")}
              </Button>
            ) : null}
            <Button type="button" size="sm" onClick={onNext}>
              {isLastStep ? t("done") : t("next")}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
