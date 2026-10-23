"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import type { Locale } from "@/i18n/locales";
import { intlTag } from "@/i18n/locales";
import { localizeHref } from "@/i18n/routing";
import { getPlan } from "@/lib/billing/plans";
import { agentPhoto } from "@/lib/agents/media";
import {
  QUIZ_BUSINESSES,
  QUIZ_COOKIE,
  QUIZ_COOKIE_MAX_AGE,
  QUIZ_PAINS,
  QUIZ_VOLUMES,
  quizAgentSlug,
  quizTier,
  serializeQuizAnswers,
  type QuizAnswers,
  type QuizBusiness,
  type QuizPain,
  type QuizVolume,
} from "@/lib/quiz/answers";
import { ArrowRightIcon, ChevronLeftIcon, CheckIcon } from "@/components/ui/icons";
import { SignUpForm } from "@/components/auth/sign-up-form";
import logo from "../../../public/logo.png";

type Step = "business" | "volume" | "pain" | "building" | "result";
type ChatLine = { from: "customer" | "agent"; text: string };

const QUESTION_STEPS = ["business", "volume", "pain"] as const;
const BUILDING_MS = 1400;
const VERTICAL_CHAT_KEYS = new Set<string>(["barber", "salon", "nails", "dental", "nutri", "pilates"]);
const AGENT_NAMES = { ana: "Ana", malu: "Malu" } as const;

const OPTION =
  "flex w-full items-center justify-between gap-3 rounded-lg border border-primary-fixed bg-white/80 px-4 py-4 text-left text-body-md font-medium text-on-surface transition-all duration-150 hover:border-primary/50 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 active:scale-[0.99]";

export function StartQuiz({ initialBusiness }: { initialBusiness: QuizBusiness | null }) {
  const t = useTranslations("Quiz");
  const locale = useLocale() as Locale;

  const questions = useMemo(
    () => QUESTION_STEPS.filter((s) => !(s === "business" && initialBusiness)),
    [initialBusiness],
  );

  const [step, setStep] = useState<Step>(questions[0]);
  const [business, setBusiness] = useState<QuizBusiness | null>(initialBusiness);
  const [volume, setVolume] = useState<QuizVolume | null>(null);
  const [pain, setPain] = useState<QuizPain | null>(null);

  const answers: QuizAnswers | null = business && volume && pain ? { business, volume, pain } : null;

  useEffect(() => {
    if (step !== "building") return;
    const id = window.setTimeout(() => setStep("result"), BUILDING_MS);
    return () => window.clearTimeout(id);
  }, [step]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const questionIndex = questions.indexOf(step as (typeof QUESTION_STEPS)[number]);
  const progress =
    step === "building" || step === "result" ? questions.length : Math.max(questionIndex, 0);

  function goBack() {
    if (questionIndex > 0) setStep(questions[questionIndex - 1]);
  }

  function next(from: (typeof QUESTION_STEPS)[number]) {
    const i = questions.indexOf(from);
    setStep(i < questions.length - 1 ? questions[i + 1] : "building");
  }

  const agent = business ? QUIZ_BUSINESSES.find((b) => b.key === business)!.agent : "ana";

  return (
    <div className="flex w-full max-w-[560px] flex-1 flex-col">
      <header className="mb-6 flex items-center justify-between">
        {questionIndex > 0 ? (
          <button
            type="button"
            onClick={goBack}
            aria-label={t("back")}
            className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-white/70 hover:text-on-surface"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
        ) : (
          <span className="h-10 w-10" />
        )}
        <Image src={logo} alt="Staffra" priority className="h-8 w-auto" />
        <span className="h-10 w-10" />
      </header>

      {step !== "result" ? (
        <div
          className="mb-8 flex gap-1.5"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={questions.length}
          aria-valuenow={progress}
          aria-label={t("progress", { current: Math.min(progress + 1, questions.length), total: questions.length })}
        >
          {questions.map((q, i) => (
            <span
              key={q}
              className={clsx(
                "h-1.5 flex-1 rounded-full transition-colors duration-300",
                i < progress ? "bg-primary" : i === progress ? "bg-primary/50" : "bg-primary-fixed",
              )}
            />
          ))}
        </div>
      ) : null}

      {step === "business" ? (
        <Question key="business" title={t("business.title")} subtitle={t("business.subtitle")}>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {QUIZ_BUSINESSES.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => {
                  setBusiness(b.key);
                  next("business");
                }}
                className={clsx(OPTION, business === b.key && "border-primary bg-primary-fixed/45")}
              >
                {t(`business.options.${b.key}`)}
              </button>
            ))}
          </div>
        </Question>
      ) : null}

      {step === "volume" ? (
        <Question key="volume" title={t("volume.title")} subtitle={t("volume.subtitle")}>
          <div className="flex flex-col gap-2.5">
            {QUIZ_VOLUMES.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => {
                  setVolume(v.key);
                  next("volume");
                }}
                className={clsx(OPTION, volume === v.key && "border-primary bg-primary-fixed/45")}
              >
                <span>{t(`volume.options.${v.key}`)}</span>
                <span className="text-label-md font-normal text-on-surface-variant">{t("volume.unit")}</span>
              </button>
            ))}
          </div>
        </Question>
      ) : null}

      {step === "pain" ? (
        <Question key="pain" title={t("pain.title")} subtitle={t("pain.subtitle")}>
          <div className="flex flex-col gap-2.5">
            {QUIZ_PAINS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPain(p);
                  if (business && volume) rememberAnswers({ business, volume, pain: p });
                  next("pain");
                }}
                className={clsx(OPTION, pain === p && "border-primary bg-primary-fixed/45")}
              >
                {t(`pain.options.${agent}.${p}`)}
              </button>
            ))}
          </div>
        </Question>
      ) : null}

      {step === "building" ? (
        <div className="animate-onboarding-step-in flex flex-1 flex-col items-center justify-center gap-5 py-20 text-center">
          <span className="onboarding-loader h-10 w-10 text-primary" aria-hidden />
          <p role="status" className="text-headline-md font-semibold tracking-tight text-on-surface">
            {t("building")}
          </p>
        </div>
      ) : null}

      {step === "result" && answers ? (
        <Result answers={answers} locale={locale} />
      ) : null}
    </div>
  );
}

function rememberAnswers(answers: QuizAnswers) {
  document.cookie = `${QUIZ_COOKIE}=${encodeURIComponent(serializeQuizAnswers(answers))}; path=/; max-age=${QUIZ_COOKIE_MAX_AGE}; samesite=lax`;
}

function Question({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="animate-onboarding-step-in flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-balance text-headline-lg font-semibold tracking-tight text-on-surface">{title}</h1>
        <p className="text-body-md text-on-surface-variant">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function Result({ answers, locale }: { answers: QuizAnswers; locale: Locale }) {
  const t = useTranslations("Quiz");
  const tVerticals = useTranslations("Verticals");
  const slug = quizAgentSlug(answers);
  const name = AGENT_NAMES[slug];
  const plan = getPlan(quizTier(answers));
  const count = new Intl.NumberFormat(intlTag(locale));

  const chat = (
    VERTICAL_CHAT_KEYS.has(answers.business)
      ? (tVerticals.raw(`${answers.business}.chat`) as ChatLine[])
      : (t.raw(`chat.${slug}`) as ChatLine[])
  ).slice(0, 4);
  const perks = t.raw(`result.perks.${slug}`) as string[];
  const trust = t.raw("result.trust") as string[];
  const photo = agentPhoto(slug);

  const heroCtaRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [heroCtaVisible, setHeroCtaVisible] = useState(true);
  const [formVisible, setFormVisible] = useState(false);

  useEffect(() => {
    const hero = heroCtaRef.current;
    const form = formRef.current;
    if (!hero || !form) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === hero) setHeroCtaVisible(entry.isIntersecting);
        if (entry.target === form) setFormVisible(entry.isIntersecting);
      }
    });
    observer.observe(hero);
    observer.observe(form);
    return () => observer.disconnect();
  }, []);

  function goToForm() {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => document.getElementById("email")?.focus({ preventScroll: true }), 450);
  }

  const showStickyCta = !heroCtaVisible && !formVisible;

  return (
    <section className="animate-onboarding-step-in flex flex-col gap-6 pb-24 sm:pb-0">
      <div className="relative overflow-hidden rounded-xl bg-[linear-gradient(140deg,#3525cd_0%,#4f46e5_55%,#6d5dfc_100%)] p-6 text-white shadow-[0_24px_60px_-24px_rgba(53,37,205,0.7)] sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.22),transparent)]"
        />
        <div className="relative flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-label-sm font-semibold uppercase tracking-[0.08em]">
              <CheckIcon className="h-3.5 w-3.5" />
              {t("result.eyebrow")}
            </span>
            <span className="inline-flex items-center rounded-full bg-[#d9fdd3] px-3 py-1 text-label-sm font-bold uppercase tracking-[0.08em] text-[#0b5c2e]">
              {t("result.freeBadge")}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="relative h-16 w-16 shrink-0">
              <span className="absolute inset-0 overflow-hidden rounded-full bg-white/20 ring-2 ring-white/60">
                {photo ? <Image src={photo} alt="" fill sizes="64px" className="object-cover object-top" /> : null}
              </span>
              <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-[#25d366] ring-2 ring-[#4338ca]" />
            </span>
            <span className="flex flex-col">
              <span className="text-body-lg font-semibold">{name}</span>
              <span className="text-label-md text-white/80">{t(`result.role.${slug}`)}</span>
            </span>
          </div>

          <h1 className="text-balance text-headline-lg font-semibold tracking-tight">
            {t(`result.headline.${slug}.${answers.pain}`, { name })}
          </h1>

          <button
            ref={heroCtaRef}
            type="button"
            onClick={goToForm}
            className="group inline-flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-white text-body-lg font-semibold text-primary shadow-[0_10px_30px_-10px_rgba(0,0,0,0.45)] transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
          >
            {t("result.cta")}
            <ArrowRightIcon className="h-5 w-5 transition-transform duration-150 group-hover:translate-x-0.5" />
          </button>

          <TrustRow items={trust} tone="light" />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-body-lg font-semibold text-on-surface">{t("result.chatTitle", { name })}</h2>
        <ol
          className="flex flex-col gap-2 rounded-lg border border-primary-fixed bg-[#efeae2] px-3 py-4 shadow-[0_12px_40px_rgba(0,0,0,0.06)]"
          aria-label={t("result.sampleLabel")}
        >
          {chat.map((line, i) => (
            <li
              key={i}
              className={clsx(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-snug shadow-sm",
                line.from === "agent" ? "self-start bg-white text-on-surface" : "self-end bg-[#d9fdd3] text-on-surface",
              )}
            >
              {line.text}
            </li>
          ))}
        </ol>
      </div>

      <div className="relative flex flex-col gap-4 rounded-xl border-2 border-primary bg-white p-5 pt-7 shadow-[0_16px_40px_-18px_rgba(53,37,205,0.55)]">
        <span className="absolute -top-3.5 left-5 inline-flex items-center rounded-full bg-primary px-3 py-1 text-label-sm font-semibold text-on-primary shadow-[0_4px_12px_-4px_rgba(53,37,205,0.5)]">
          {t("result.recommended")}
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-body-lg font-semibold text-on-surface">
            {t("result.planName", { plan: plan.displayName })}
          </span>
          <span className="text-sm text-on-surface-variant">{t(`result.planFit.${answers.volume}`)}</span>
        </div>
        <p className="flex items-baseline gap-2">
          <span className="text-headline-lg font-bold tracking-tight text-[#0b8a45]">{t("result.planFree")}</span>
          <span className="text-body-md font-medium text-on-surface-variant">{t("result.planFreeSub")}</span>
        </p>
        <p className="rounded-md bg-primary-fixed/50 px-3 py-2 text-label-md text-on-surface">
          {t("result.planReplies", { count: count.format(plan.monthlyReplyLimit ?? 0) })}
        </p>
        <ul className="flex flex-col gap-2.5">
          {perks.map((perk) => (
            <li key={perk} className="flex items-start gap-2.5 text-sm text-on-surface">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#d9fdd3] text-[#0b8a45]">
                <CheckIcon className="h-3 w-3" />
              </span>
              {perk}
            </li>
          ))}
        </ul>
      </div>

      <div
        ref={formRef}
        className="flex scroll-mt-6 flex-col gap-4 rounded-xl border border-primary/40 bg-white p-5 shadow-[0_16px_40px_-18px_rgba(53,37,205,0.45)] sm:p-6"
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-headline-md font-semibold tracking-tight text-on-surface">{t("result.signUpTitle")}</h2>
          <p className="text-sm text-on-surface-variant">{t("result.signUpSubtitle", { name })}</p>
        </div>
        <SignUpForm
          quiz={serializeQuizAnswers(answers)}
          submitLabel={t("result.cta")}
          submitNote={t("result.ctaNote")}
        />
        <TrustRow items={trust} tone="dark" />
        <p className="text-center text-sm text-on-surface-variant">
          {t("result.haveAccount")}{" "}
          <Link href={localizeHref(locale, "/?auth=login")} className="font-medium text-primary hover:underline">
            {t("result.login")}
          </Link>
        </p>
      </div>

      <StickyCta visible={showStickyCta} label={t("result.cta")} note={t("result.stickyNote")} onClick={goToForm} />
    </section>
  );
}

// Portaled: the result section animates in with a transform, which would
// otherwise make `fixed` relative to the section instead of the viewport.
function StickyCta({
  visible,
  label,
  note,
  onClick,
}: {
  visible: boolean;
  label: string;
  note: string;
  onClick: () => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      aria-hidden={!visible}
      className={clsx(
        "fixed inset-x-0 bottom-0 z-40 border-t border-primary-fixed bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_30px_-12px_rgba(0,0,0,0.18)] backdrop-blur-md transition-transform duration-300 sm:hidden",
        visible ? "translate-y-0" : "pointer-events-none translate-y-full",
      )}
    >
      <button
        type="button"
        tabIndex={visible ? 0 : -1}
        onClick={onClick}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-body-md font-semibold text-on-primary"
      >
        {label}
        <ArrowRightIcon className="h-4 w-4" />
      </button>
      <p className="mt-1.5 text-center text-label-sm text-on-surface-variant">{note}</p>
    </div>,
    document.body,
  );
}

function TrustRow({ items, tone }: { items: string[]; tone: "light" | "dark" }) {
  return (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li
          key={item}
          className={clsx(
            "flex items-center gap-1.5 text-label-md",
            tone === "light" ? "text-white/90" : "text-on-surface-variant",
          )}
        >
          <CheckIcon className={clsx("h-3.5 w-3.5", tone === "light" ? "text-[#d9fdd3]" : "text-[#0b8a45]")} />
          {item}
        </li>
      ))}
    </ul>
  );
}
