"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { PlayIcon } from "@/components/ui/icons";

// Owner-recorded walkthrough of this page, Ana-specific (see page.tsx's own
// call site) -- not a generic "how Staffra works" video, so it's never
// offered on another agent's Connections page. Thumbnail-click opens a
// Dialog rather than an inline <video>, so the ~5MB file is never fetched
// until a merchant actually asks to watch it.
export function TutorialVideoCard({ agentName }: { agentName: string }) {
  const t = useTranslations("MyAgents.tutorial");
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (open) {
      videoRef.current?.play().catch(() => {
        // Autoplay-with-sound can still be blocked in rare browser/OS
        // configurations even from a click -- the visible `controls` bar
        // is the fallback, never a silently broken player.
      });
    } else {
      const video = videoRef.current;
      if (video) {
        video.pause();
        video.currentTime = 0;
      }
    }
  }, [open]);

  return (
    <>
      <Card className="flex flex-col items-center gap-4 sm:flex-row">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("watch")}
          className="group relative aspect-video w-full shrink-0 overflow-hidden rounded-lg border border-outline-variant sm:w-56"
        >
          {/* Arbitrary local asset, not next/image-optimizable and not worth
              the config for a single thumbnail. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/tutorials/ana-tutorial-poster.jpg"
            alt=""
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-on-surface/20 transition-colors group-hover:bg-on-surface/30">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-lowest/95 text-primary shadow-level1">
              <PlayIcon className="ml-0.5 h-5 w-5" />
            </span>
          </span>
        </button>
        <div className="flex flex-1 flex-col gap-1 text-center sm:text-left">
          <h3 className="text-base font-semibold text-on-surface">{t("title")}</h3>
          <p className="text-sm text-on-surface-variant">{t("description", { name: agentName })}</p>
        </div>
      </Card>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("title")}
        closeLabel={t("close")}
        widthClassName="max-w-3xl"
      >
        <video
          ref={videoRef}
          controls
          playsInline
          poster="/tutorials/ana-tutorial-poster.jpg"
          className="w-full rounded-lg"
        >
          <source src="/tutorials/ana-tutorial.mp4" type="video/mp4" />
        </video>
      </Dialog>
    </>
  );
}
