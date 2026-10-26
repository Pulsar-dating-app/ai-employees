import { useTranslations } from "next-intl";
import { ChevronDownIcon, LightbulbIcon } from "@/components/ui/icons";

type Tip = { label: string; text: string };

// Merchants were saving services as "Axila" or "Costas", with no price or
// description, and the assistant answers customers with exactly that. Shown
// at the top of the dashboard's service form.
// `collapsible`: a one-line toggle that opens to the full tips. The service
// form uses it on top of its first field, where the open box took half a
// phone screen before anything could be typed.
export function ServiceTips({ collapsible = false }: { collapsible?: boolean }) {
  const t = useTranslations("ServiceTips");
  const tips = t.raw("items") as Tip[];

  if (collapsible) {
    return (
      <details className="group rounded-lg border border-[#e9c46a]/60 bg-[#fff8e1] px-4 py-3 text-on-surface">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <LightbulbIcon className="h-4 w-4 shrink-0 text-[#b7791f]" />
          <span className="flex-1">{t("title")}</span>
          <ChevronDownIcon className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-2 flex flex-col gap-2 pl-6">
          <p className="text-sm text-on-surface-variant">{t("intro")}</p>
          <ul className="flex flex-col gap-1.5">
            {tips.map((tip) => (
              <li key={tip.label} className="text-sm leading-relaxed">
                <span className="font-semibold">{tip.label}:</span> {tip.text}
              </li>
            ))}
          </ul>
        </div>
      </details>
    );
  }

  return (
    <aside className="flex gap-3 rounded-lg border border-[#e9c46a]/60 bg-[#fff8e1] px-4 py-3.5 text-on-surface">
      <LightbulbIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#b7791f]" />
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-semibold">{t("title")}</p>
        <p className="text-sm text-on-surface-variant">{t("intro")}</p>
        <ul className="flex flex-col gap-1.5">
          {tips.map((tip) => (
            <li key={tip.label} className="text-sm leading-relaxed">
              <span className="font-semibold">{tip.label}:</span> {tip.text}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
