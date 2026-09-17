"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { PlusIcon, XIcon } from "@/components/ui/icons";
import {
  DEFAULT_OPEN_DAYS,
  DEFAULT_OPEN_FROM,
  DEFAULT_OPEN_TO,
  SERVICE_PRESETS,
  SERVICE_PRESET_TRADES,
  type ServicePresetTrade,
} from "@/lib/appointments/service-presets";
import { StepActions } from "../step-card";
import { NarratedFeed, type FeedLine } from "./narrated-feed";
import { finishOnboarding } from "@/lib/companies/finish-onboarding";
import { OnboardingLoader } from "../onboarding-loader";

type Draft = { id: string; name: string; durationMinutes: number };

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const PAYOFF_DWELL_MS = 1400;
const FIELD =
  "h-11 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface transition-all duration-200 placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20";

export function ServicesSetup({ companyId, agentName }: { companyId: string; agentName: string }) {
  const t = useTranslations("Onboarding.setup.services");
  const router = useRouter();

  const [trade, setTrade] = useState<ServicePresetTrade | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [days, setDays] = useState<number[]>([...DEFAULT_OPEN_DAYS]);
  const [from, setFrom] = useState(DEFAULT_OPEN_FROM);
  const [to, setTo] = useState(DEFAULT_OPEN_TO);
  const [lines, setLines] = useState<FeedLine[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function chooseTrade(next: ServicePresetTrade) {
    setTrade(next);
    setDrafts(
      SERVICE_PRESETS[next].map((preset) => ({
        id: `${next}-${preset.key}`,
        name: t(`presets.${next}.${preset.key}`),
        durationMinutes: preset.durationMinutes,
      })),
    );
  }

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  const valid = drafts.length > 0 && drafts.every((d) => d.name.trim() && d.durationMinutes > 0) && days.length > 0 && from < to;

  function settle(id: string, patch: Partial<FeedLine>) {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch, state: "done" } : line)));
  }

  // Narrated one stage at a time, as each actually finishes -- services then
  // hours really do save in that order, so this tells the truth about it
  // rather than declaring all three lines done the moment both requests
  // happen to have settled. Each line lands as its own state change, so
  // NarratedFeed's per-line entrance staggers them exactly as they occur.
  async function handleSave() {
    if (!valid || isSaving) return;
    setError(null);
    setIsSaving(true);
    setLines([{ id: "services", text: t("feedSaving"), state: "running" }]);

    const created = await Promise.all(
      drafts.map((draft) =>
        fetch(`/api/companies/${companyId}/services`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name.trim(),
            duration_minutes: draft.durationMinutes,
          }),
        }).then((res) => res.ok),
      ),
    );

    if (created.some((ok) => !ok)) {
      setIsSaving(false);
      setLines([]);
      setError(t("errorSaving"));
      return;
    }

    settle("services", { text: t("feedServices", { count: drafts.length }) });
    setLines((prev) => [...prev, { id: "hours", text: t("feedSavingHours"), state: "running" }]);

    const hoursRes = await fetch(`/api/companies/${companyId}/business-hours`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessHours: days.map((day) => ({ day_of_week: day, start_time: from, end_time: to })),
      }),
    });

    if (!hoursRes.ok) {
      setIsSaving(false);
      setLines([]);
      setError(t("errorHours"));
      return;
    }

    settle("hours", { text: t("feedHours", { count: days.length }), detail: `${from}–${to}` });
    setLines((prev) => [...prev, { id: "ready", text: t("feedReady", { name: agentName }), state: "done" }]);
    setIsSaving(false);

    // Same reason as the catalogue branch: the payoff needs a frame to land in.
    await new Promise((resolve) => setTimeout(resolve, PAYOFF_DWELL_MS));
    router.push("/onboarding/ready");
  }

  if (lines.length > 0) {
    return <NarratedFeed lines={lines} />;
  }

  if (!trade) {
    return (
      <div className="flex flex-col gap-7">
        {/* Not a radiogroup: choosing one advances the screen, so nothing is
            ever left in a checked state to describe. */}
        <div role="group" aria-label={t("tradeLabel")} className="grid gap-2.5 sm:grid-cols-2">
          {SERVICE_PRESET_TRADES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => chooseTrade(option)}
              className="flex items-center justify-between gap-3 rounded-lg border border-primary-fixed bg-white/70 px-5 py-4 text-left text-body-md text-on-surface transition-all duration-200 hover:border-primary/40 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
            >
              <span className="font-medium">{t(`trades.${option}`)}</span>
              <span className="text-label-sm text-on-surface-variant">
                {SERVICE_PRESETS[option].length > 0 ? t("tradeCount", { count: SERVICE_PRESETS[option].length }) : t("tradeEmpty")}
              </span>
            </button>
          ))}
        </div>

        <form action={finishOnboarding}>
          <button
            type="submit"
            className="w-fit rounded-md text-label-md font-medium text-on-surface-variant underline-offset-4 transition-colors hover:text-on-surface hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
          >
            {t("skip")}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-label-md font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
            {t("listTitle")}
          </h2>
          <button
            type="button"
            onClick={() => setTrade(null)}
            className="text-label-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("changeTrade")}
          </button>
        </div>

        <ul className="flex flex-col gap-2">
          {drafts.map((draft) => (
            <li key={draft.id} className="flex items-center gap-2">
              <input
                value={draft.name}
                onChange={(e) => updateDraft(draft.id, { name: e.target.value })}
                aria-label={t("nameLabel")}
                className={clsx(FIELD, "min-w-0 flex-1")}
              />
              <div className="relative shrink-0">
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={draft.durationMinutes}
                  onChange={(e) => updateDraft(draft.id, { durationMinutes: Number(e.target.value) })}
                  aria-label={t("durationLabel")}
                  className={clsx(FIELD, "w-[104px] pr-10 tabular-nums")}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-label-sm text-on-surface-variant">
                  {t("minutes")}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDrafts((prev) => prev.filter((d) => d.id !== draft.id))}
                aria-label={t("remove", { name: draft.name })}
                className="flex h-11 w-9 shrink-0 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:bg-error-container/40 hover:text-error focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() =>
            setDrafts((prev) => [
              ...prev,
              { id: `custom-${Date.now()}`, name: "", durationMinutes: 60 },
            ])
          }
          className="flex w-fit items-center gap-1.5 text-label-md font-medium text-primary underline-offset-4 hover:underline"
        >
          <PlusIcon className="h-4 w-4" />
          {t("addService")}
        </button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-label-md font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
          {t("hoursTitle")}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {DAY_ORDER.map((day) => {
            const on = days.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                onClick={() => setDays((prev) => (on ? prev.filter((d) => d !== day) : [...prev, day]))}
                className={clsx(
                  "h-10 w-11 rounded-md text-label-md font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                  on
                    ? "bg-primary text-on-primary"
                    : "border border-primary-fixed bg-white/70 text-on-surface-variant hover:border-primary/40",
                )}
              >
                {t(`days.${day}`)}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label={t("fromLabel")}
            className={clsx(FIELD, "w-[130px] tabular-nums")}
          />
          <span className="text-on-surface-variant">{t("until")}</span>
          <input
            type="time"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label={t("toLabel")}
            className={clsx(FIELD, "w-[130px] tabular-nums")}
          />
        </div>
      </section>

      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}

      <StepActions>
        <p className="mr-auto text-label-sm text-on-surface-variant">{t("laterHint")}</p>
        <Button
          type="button"
          isLoading={isSaving}
          loadingIndicator={<OnboardingLoader />}
          disabled={!valid}
          onClick={handleSave}
        >
          {t("cta")}
        </Button>
      </StepActions>
    </div>
  );
}
