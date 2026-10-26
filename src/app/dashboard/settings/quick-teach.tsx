"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { FIELD_LABEL_CLASSES, Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckIcon } from "@/components/ui/icons";
import { intlTag } from "@/i18n/locales";
import { track } from "@/lib/funnel/client";

const PAYMENT_METHODS = ["pix", "credit", "debit", "cash", "installments", "boleto"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// The first thing on Settings until the business has enough written down
// (SETTINGS_MIN_SECTIONS). Nobody among the first ad sign-ups filled the long
// blank fields below it, so this asks three questions a phone can answer:
// what you do (a short sentence), how customers pay (taps, not typing) and
// where you are. They land in the same columns the full form edits --
// `description`, `payment_policy`, `address` -- so nothing reads them
// differently.
export function QuickTeach({
  companyId,
  agentName,
  scheduling,
  initial,
}: {
  companyId: string;
  agentName: string;
  scheduling: boolean;
  initial: { description: string | null; payment_policy: string | null; address: string | null };
}) {
  const t = useTranslations("Settings.quickTeach");
  const locale = useLocale();
  const router = useRouter();

  const [description, setDescription] = useState(initial.description ?? "");
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [paymentNote, setPaymentNote] = useState("");
  const [address, setAddress] = useState(initial.address ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(false);

  // An existing payment policy is the merchant's own words; the chips only
  // write one when there is none, never over it.
  const askPayments = !initial.payment_policy;

  function toggle(method: PaymentMethod) {
    setMethods((prev) => (prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]));
  }

  function paymentPolicy(): string | null {
    if (!askPayments) return null;
    const note = paymentNote.trim();
    if (methods.length === 0) return note || null;
    const list = new Intl.ListFormat(intlTag(locale), { type: "conjunction" }).format(
      methods.map((m) => t(`payments.methods.${m}`)),
    );
    return [t("payments.sentence", { list }), note].filter(Boolean).join(" ");
  }

  const patch: Record<string, string> = {};
  if (description.trim() && description.trim() !== (initial.description ?? "")) patch.description = description.trim();
  if (address.trim() && address.trim() !== (initial.address ?? "")) patch.address = address.trim();
  const payment = paymentPolicy();
  if (payment) patch.payment_policy = payment;
  const canSave = Object.keys(patch).length > 0;

  async function save() {
    if (!canSave || isSaving) return;
    setIsSaving(true);
    setError(false);
    const res = await fetch(`/api/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (!res?.ok) {
      setIsSaving(false);
      setError(true);
      return;
    }
    track("quick_teach_saved", { fields: Object.keys(patch).join(",") });
    // The page re-renders without this card (or with it, if still short of
    // the minimum) and confirms the save at the top.
    router.replace("/dashboard/settings?pronto=1");
    router.refresh();
  }

  return (
    <section
      aria-labelledby="quick-teach-title"
      className="flex flex-col gap-6 rounded-3xl border-2 border-primary/40 bg-surface-container-lowest p-5 shadow-[0_18px_40px_-24px_rgba(53,37,205,0.45)] sm:p-7"
    >
      <div className="flex flex-col gap-1">
        <h2 id="quick-teach-title" className="text-headline-md font-semibold tracking-tight text-on-surface">
          {t("title", { name: agentName })}
        </h2>
        <p className="text-body-md text-on-surface-variant">{t("subtitle", { name: agentName })}</p>
      </div>

      <Textarea
        id="quick-teach-description"
        label={t("description.label")}
        placeholder={t(scheduling ? "description.placeholderBooking" : "description.placeholderSales")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={5000}
        rows={3}
      />

      {askPayments ? (
        <fieldset className="flex flex-col gap-3">
          <legend className={clsx("mb-2", FIELD_LABEL_CLASSES)}>{t("payments.label")}</legend>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((method) => {
              const on = methods.includes(method);
              return (
                <button
                  key={method}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(method)}
                  className={clsx(
                    "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                    on
                      ? "border-primary bg-primary text-on-primary"
                      : "border-outline-variant bg-surface-container-low text-on-surface hover:border-primary/40",
                  )}
                >
                  {on ? <CheckIcon className="h-3.5 w-3.5" /> : null}
                  {t(`payments.methods.${method}`)}
                </button>
              );
            })}
          </div>
          <Input
            id="quick-teach-payment-note"
            label={t("payments.noteLabel")}
            placeholder={t(scheduling ? "payments.notePlaceholderBooking" : "payments.notePlaceholderSales")}
            value={paymentNote}
            onChange={(e) => setPaymentNote(e.target.value)}
            maxLength={500}
          />
        </fieldset>
      ) : null}

      <Input
        id="quick-teach-address"
        label={t(scheduling ? "address.labelBooking" : "address.labelSales")}
        placeholder={t("address.placeholder")}
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        maxLength={255}
      />

      {error ? (
        <p role="alert" className="text-sm text-error">
          {t("error")}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-label-sm text-on-surface-variant">{t("hint")}</p>
        <Button type="button" onClick={save} isLoading={isSaving} disabled={!canSave} className="w-full sm:w-auto">
          {t("save")}
        </Button>
      </div>
    </section>
  );
}
