"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations, useLocale } from "next-intl";
import { landingV2Sans } from "./fonts";
import { SALES_LEAD_INTERESTS, SALES_LEAD_REFERRALS } from "@/lib/sales-leads/options";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FormState = {
  name: string;
  email: string;
  whatsapp: string;
  interests: string[];
  companyName: string;
  message: string;
  referralSource: string;
};

const EMPTY: FormState = {
  name: "",
  email: "",
  whatsapp: "",
  interests: [],
  companyName: "",
  message: "",
  referralSource: "",
};

const inputClass =
  "w-full rounded-xl border border-[#eae6f4] bg-[#f5f2ff] px-4 py-3 text-[14px] text-[#0f172a] outline-none transition-colors placeholder:text-[#64748b] focus:border-[#3525cd] focus:bg-white";

function Check({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function SalesContactDialog({
  triggerClassName,
  triggerLabel,
  children,
}: {
  triggerClassName?: string;
  triggerLabel?: string;
  children: ReactNode;
}) {
  const t = useTranslations("LandingV2.salesContact");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "error" | "success">("idle");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function close() {
    setOpen(false);
    setStep(0);
    setForm(EMPTY);
    setShowErrors(false);
    setSubmitting(false);
    setStatus("idle");
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleInterest(key: string) {
    setForm((f) => ({
      ...f,
      interests: f.interests.includes(key)
        ? f.interests.filter((i) => i !== key)
        : [...f.interests, key],
    }));
  }

  const step1Valid =
    form.name.trim().length > 0 && EMAIL_RE.test(form.email.trim()) && form.whatsapp.trim().length >= 5;
  const step2Valid = form.interests.length > 0;
  const step3Valid = form.companyName.trim().length > 0 && form.message.trim().length > 0;
  const stepValid = [step1Valid, step2Valid, step3Valid][step];

  function goNext() {
    if (!stepValid) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStep((s) => s + 1);
  }

  function goBack() {
    setShowErrors(false);
    setStatus("idle");
    setStep((s) => Math.max(0, s - 1));
  }

  async function submit() {
    if (!step3Valid) {
      setShowErrors(true);
      return;
    }
    setSubmitting(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/sales-contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          whatsapp: form.whatsapp.trim(),
          interests: form.interests,
          companyName: form.companyName.trim(),
          message: form.message.trim(),
          referralSource: form.referralSource || null,
          locale,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("success");
    } catch {
      setStatus("error");
    } finally {
      setSubmitting(false);
    }
  }

  const stepKeys = ["you", "interests", "company"] as const;

  return (
    <>
      <button
        type="button"
        aria-label={triggerLabel}
        className={triggerClassName}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={`${landingV2Sans.className} landing-v2-root fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-4`}
          >
            <div
              className="absolute inset-0 bg-[#0f172a]/45 backdrop-blur-sm"
              onClick={close}
              aria-hidden="true"
            />
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="sales-contact-title"
              tabIndex={-1}
              className="relative z-10 max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-t-3xl bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.28)] outline-none sm:rounded-3xl sm:p-8"
            >
              <button
                type="button"
                onClick={close}
                aria-label={t("close")}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-[#0f172a]/5 text-[#0f172a] transition-colors hover:bg-[#0f172a]/10"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>

              {status === "success" ? (
                <div className="py-6 text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#10b981]/12 text-[#10b981]">
                    <Check className="h-6 w-6" />
                  </span>
                  <h2 id="sales-contact-title" className="mt-4 text-[22px] font-bold text-[#0f172a]">
                    {t("successTitle")}
                  </h2>
                  <p className="mx-auto mt-2 max-w-sm text-[14px] leading-[22px] text-[#464555]">
                    {t("successBody")}
                  </p>
                  <button
                    type="button"
                    onClick={close}
                    className="mt-6 rounded-xl bg-[#3525cd] px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#4f46e5]"
                  >
                    {t("close")}
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-5 pr-8">
                    <h2 id="sales-contact-title" className="text-[22px] font-bold text-[#0f172a] sm:text-[26px]">
                      {t("title")}
                    </h2>
                    <p className="mt-1.5 text-[14px] text-[#464555]">{t("subtitle")}</p>
                  </div>

                  <ol className="flex items-center gap-2">
                    {stepKeys.map((key, i) => {
                      const done = i < step;
                      const current = i === step;
                      return (
                        <li key={key} className="flex flex-1 items-center gap-2">
                          <button
                            type="button"
                            disabled={i >= step}
                            onClick={() => i < step && setStep(i)}
                            className={`flex items-center gap-2 ${i < step ? "cursor-pointer" : "cursor-default"}`}
                          >
                            <span
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold transition-colors ${
                                current
                                  ? "bg-[#3525cd] text-white"
                                  : done
                                    ? "bg-[#3525cd]/15 text-[#3525cd]"
                                    : "border border-[#eae6f4] bg-[#f5f2ff] text-[#64748b]"
                              }`}
                            >
                              {done ? <Check className="h-3 w-3" /> : i + 1}
                            </span>
                            <span
                              className={`hidden text-[12px] font-semibold lg:block ${
                                current ? "text-[#0f172a]" : "text-[#64748b]"
                              }`}
                            >
                              {t(`steps.${key}`)}
                            </span>
                          </button>
                          {i < stepKeys.length - 1 && (
                            <span className={`h-px flex-1 ${done ? "bg-[#3525cd]/40" : "bg-[#eae6f4]"}`} />
                          )}
                        </li>
                      );
                    })}
                  </ol>

                  <div className="mt-6 flex flex-col gap-5">
                    {step === 0 && (
                      <>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-[13px] font-semibold text-[#0f172a]">
                            {t("fields.name")}
                            <span className="text-[#3525cd]"> *</span>
                          </span>
                          <input
                            className={inputClass}
                            type="text"
                            autoComplete="name"
                            placeholder={t("fields.namePlaceholder")}
                            value={form.name}
                            onChange={(e) => set("name", e.target.value)}
                          />
                        </label>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[13px] font-semibold text-[#0f172a]">
                              {t("fields.email")}
                              <span className="text-[#3525cd]"> *</span>
                            </span>
                            <input
                              className={inputClass}
                              type="email"
                              autoComplete="email"
                              placeholder={t("fields.emailPlaceholder")}
                              value={form.email}
                              onChange={(e) => set("email", e.target.value)}
                            />
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[13px] font-semibold text-[#0f172a]">
                              {t("fields.whatsapp")}
                              <span className="text-[#3525cd]"> *</span>
                            </span>
                            <input
                              className={inputClass}
                              type="tel"
                              autoComplete="tel"
                              placeholder={t("fields.whatsappPlaceholder")}
                              value={form.whatsapp}
                              onChange={(e) => set("whatsapp", e.target.value)}
                            />
                          </label>
                        </div>
                      </>
                    )}

                    {step === 1 && (
                      <>
                        <p className="text-[13px] text-[#464555]">{t("interestsHint")}</p>
                        <div className="flex flex-col gap-3">
                          {SALES_LEAD_INTERESTS.map((key) => {
                            const selected = form.interests.includes(key);
                            const desc = t(`interests.${key}.desc`);
                            return (
                              <button
                                key={key}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => toggleInterest(key)}
                                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                                  selected
                                    ? "border-[#3525cd] bg-[#3525cd]/[0.06]"
                                    : "border-[#eae6f4] bg-[#f5f2ff] hover:border-[#64748b]"
                                }`}
                              >
                                <span
                                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                                    selected
                                      ? "border-[#3525cd] bg-[#3525cd] text-white"
                                      : "border-[#cbd5e1] bg-white"
                                  }`}
                                >
                                  {selected && <Check className="h-3 w-3" />}
                                </span>
                                <span>
                                  <span className="block text-[14px] font-semibold text-[#0f172a]">
                                    {t(`interests.${key}.label`)}
                                  </span>
                                  {desc && (
                                    <span className="block text-[13px] text-[#464555]">{desc}</span>
                                  )}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {step === 2 && (
                      <>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-[13px] font-semibold text-[#0f172a]">
                            {t("fields.companyName")}
                            <span className="text-[#3525cd]"> *</span>
                          </span>
                          <input
                            className={inputClass}
                            type="text"
                            autoComplete="organization"
                            maxLength={160}
                            placeholder={t("fields.companyNamePlaceholder")}
                            value={form.companyName}
                            onChange={(e) => set("companyName", e.target.value)}
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-[13px] font-semibold text-[#0f172a]">
                            {t("fields.referralSource")}
                          </span>
                          <select
                            className={`${inputClass} ${form.referralSource === "" ? "text-[#64748b]" : ""}`}
                            value={form.referralSource}
                            onChange={(e) => set("referralSource", e.target.value)}
                          >
                            <option value="">{t("fields.referralSourcePlaceholder")}</option>
                            {SALES_LEAD_REFERRALS.map((key) => (
                              <option key={key} value={key} className="text-[#0f172a]">
                                {t(`referrals.${key}`)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-[13px] font-semibold text-[#0f172a]">
                            {t("fields.message")}
                            <span className="text-[#3525cd]"> *</span>
                          </span>
                          <textarea
                            className={`${inputClass} min-h-[110px] resize-y`}
                            maxLength={4000}
                            rows={4}
                            placeholder={t("fields.messagePlaceholder")}
                            value={form.message}
                            onChange={(e) => set("message", e.target.value)}
                          />
                        </label>
                      </>
                    )}

                    {showErrors && !stepValid && (
                      <p className="text-[13px] text-[#ba1a1a]">{t("errorRequired")}</p>
                    )}
                    {status === "error" && (
                      <p className="text-[13px] text-[#ba1a1a]">{t("errorSubmit")}</p>
                    )}

                    <div className="mt-1 flex items-center gap-3">
                      {step > 0 && (
                        <button
                          type="button"
                          onClick={goBack}
                          className="rounded-xl border border-[#eae6f4] px-5 py-3 text-[14px] font-bold text-[#0f172a] transition-colors hover:bg-[#f5f2ff]"
                        >
                          {t("back")}
                        </button>
                      )}
                      {step < 2 ? (
                        <button
                          type="button"
                          onClick={goNext}
                          className="flex-1 rounded-xl bg-[#3525cd] px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#4f46e5]"
                        >
                          {t("next")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={submit}
                          disabled={submitting}
                          className="flex-1 rounded-xl bg-[#3525cd] px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#4f46e5] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {submitting ? t("submitting") : t("submit")}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
