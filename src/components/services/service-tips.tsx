import { useTranslations } from "next-intl";
import { LightbulbIcon } from "@/components/ui/icons";

type Tip = { label: string; text: string };

// Merchants were saving services as "Axila" or "Costas", with no price or
// description, and the assistant answers customers with exactly that. Shown
// at the top of the dashboard's service form.
export function ServiceTips() {
  const t = useTranslations("ServiceTips");
  const tips = t.raw("items") as Tip[];

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
