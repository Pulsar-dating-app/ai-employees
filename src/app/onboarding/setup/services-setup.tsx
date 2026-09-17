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

type Draft = { id: string; name: string; durationMinutes: number; price: string };
type DayHours = { start: string; end: string };

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const PAYOFF_DWELL_MS = 1400;
const FIELD =
  "h-11 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface transition-all duration-200 placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20";

function initialHours(): Record<number, DayHours | null> {
  const initial: Record<number, DayHours | null> = {};
  for (const day of DAY_ORDER) {
    initial[day] = (DEFAULT_OPEN_DAYS as readonly number[]).includes(day)
      ? { start: DEFAULT_OPEN_FROM, end: DEFAULT_OPEN_TO }
      : null;
  }
  return initial;
}

export function ServicesSetup({ companyId, agentName }: { companyId: string; agentName: string }) {
  const t = useTranslations("Onboarding.setup.services");
  const router = useRouter();

  const [trade, setTrade] = useState<ServicePresetTrade | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [hours, setHours] = useState<Record<number, DayHours | null>>(initialHours);
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
        price: "",
      })),
    );
  }

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  // Toggling a day off drops its hours; toggling it back on starts from the
  // same default every day begins with, not whatever it last held -- a
  // reopened day is a fresh choice, not an undo.
  function toggleDay(day: number) {
    setHours((prev) => ({
      ...prev,
      [day]: prev[day] ? null : { start: DEFAULT_OPEN_FROM, end: DEFAULT_OPEN_TO },
    }));
  }

  function setDayHours(day: number, patch: Partial<DayHours>) {
    setHours((prev) => {
      const current = prev[day];
      return current ? { ...prev, [day]: { ...current, ...patch } } : prev;
    });
  }

  const openDays = DAY_ORDER.filter((day) => hours[day]);
  const hoursValid = openDays.length > 0 && openDays.every((day) => hours[day]!.start < hours[day]!.end);
  const pricesValid = drafts.every((d) => d.price.trim() === "" || Number(d.price) >= 0);
  const valid =
    drafts.length > 0 &&
    drafts.every((d) => d.name.trim() && d.durationMinutes > 0) &&
    pricesValid &&
    hoursValid;

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
      drafts.map((draft) => {
        const hasPrice = draft.price.trim() !== "";
        return fetch(`/api/companies/${companyId}/services`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name.trim(),
            duration_minutes: draft.durationMinutes,
            // Onboarding never asks the currency: every company created here
            // starts with currency unset (createCompany only collects the
            // name), and this product is Brazil-first everywhere else a
            // price is shown (see plan/page.tsx). Settings lets her change it
            // later along with the price itself.
            ...(hasPrice ? { price: Number(draft.price), currency: "BRL" } : {}),
          }),
        }).then((res) => res.ok);
      }),
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
        businessHours: openDays.map((day) => ({
          day_of_week: day,
          start_time: hours[day]!.start,
          end_time: hours[day]!.end,
        })),
      }),
    });

    if (!hoursRes.ok) {
      setIsSaving(false);
      setLines([]);
      setError(t("errorHours"));
      return;
    }

    // The detail only names a single range when every open day actually
    // shares it -- the common case, and the only one a single "09:00–18:00"
    // line can say honestly. Different hours per day still get a truthful
    // count with no invented range.
    const first = hours[openDays[0]]!;
    const sameEveryDay = openDays.every(
      (day) => hours[day]!.start === first.start && hours[day]!.end === first.end,
    );
    settle("hours", {
      text: t("feedHours", { count: openDays.length }),
      detail: sameEveryDay ? `${first.start}–${first.end}` : undefined,
    });
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
            <li key={draft.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={draft.name}
                onChange={(e) => updateDraft(draft.id, { name: e.target.value })}
                aria-label={t("nameLabel")}
                className={clsx(FIELD, "min-w-0 flex-1")}
              />
              <div className="flex items-center gap-2">
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
                <div className="relative shrink-0">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-label-sm text-on-surface-variant">
                    {t("pricePrefix")}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    inputMode="decimal"
                    value={draft.price}
                    onChange={(e) => updateDraft(draft.id, { price: e.target.value })}
                    placeholder={t("pricePlaceholder")}
                    aria-label={t("priceLabel")}
                    className={clsx(FIELD, "w-[112px] pl-9 tabular-nums")}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setDrafts((prev) => prev.filter((d) => d.id !== draft.id))}
                  aria-label={t("remove", { name: draft.name })}
                  className="flex h-11 w-9 shrink-0 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:bg-error-container/40 hover:text-error focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() =>
            setDrafts((prev) => [
              ...prev,
              { id: `custom-${Date.now()}`, name: "", durationMinutes: 60, price: "" },
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
        {/* Each day keeps its own hours -- same shape as Settings' business
            hours card, minus split shifts (one range a day covers what
            onboarding needs; a second shift is a Settings-time edit). */}
        <div className="flex flex-col gap-2">
          {DAY_ORDER.map((day) => {
            const dayHours = hours[day];
            const open = dayHours !== null;
            const dayName = t(`days.${day}`);
            return (
              <div
                key={day}
                className={clsx(
                  "flex flex-col gap-2 rounded-md border px-3 py-2 transition-colors duration-200 sm:flex-row sm:items-center sm:gap-3",
                  open ? "border-primary-fixed bg-white/70" : "border-transparent",
                )}
              >
                <button
                  type="button"
                  aria-pressed={open}
                  onClick={() => toggleDay(day)}
                  className={clsx(
                    "h-10 w-11 shrink-0 rounded-md text-label-md font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                    open
                      ? "bg-primary text-on-primary"
                      : "border border-primary-fixed bg-white/70 text-on-surface-variant hover:border-primary/40",
                  )}
                >
                  {dayName}
                </button>

                {dayHours ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={dayHours.start}
                      onChange={(e) => setDayHours(day, { start: e.target.value })}
                      aria-label={`${dayName} — ${t("fromLabel")}`}
                      className={clsx(FIELD, "w-[120px] tabular-nums")}
                    />
                    <span className="text-on-surface-variant">{t("until")}</span>
                    <input
                      type="time"
                      value={dayHours.end}
                      onChange={(e) => setDayHours(day, { end: e.target.value })}
                      aria-label={`${dayName} — ${t("toLabel")}`}
                      className={clsx(FIELD, "w-[120px] tabular-nums")}
                    />
                  </div>
                ) : (
                  <span className="text-label-sm text-on-surface-variant">{t("closed")}</span>
                )}
              </div>
            );
          })}
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
