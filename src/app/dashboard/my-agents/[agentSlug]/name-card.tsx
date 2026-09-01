"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Lets a merchant rename a hired team member. Writes company_agents.name via
// PATCH /api/companies/:id/agents/:slug (merge-patch, same endpoint the K6
// pause/activate switch uses), admin-gated at the app layer like the other
// controls on this page. The chosen name is what shows across the dashboard,
// the hosted chat page and the conversations inbox; clearing it back to the
// platform default just means saving the default name explicitly.
const MAX_NAME_LENGTH = 60;

export function NameCard({
  companyId,
  agentSlug,
  initialName,
  defaultName,
  canEdit,
}: {
  companyId: string;
  agentSlug: string;
  initialName: string;
  defaultName: string;
  canEdit: boolean;
}) {
  const t = useTranslations("MyAgents.name");
  const router = useRouter();
  const [value, setValue] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trimmed = value.trim();
  const dirty = trimmed !== savedName;

  async function save() {
    if (!trimmed) {
      setErrorMessage(t("emptyError"));
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    setJustSaved(false);
    try {
      const res = await fetch(`/api/companies/${companyId}/agents/${agentSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        setErrorMessage(t("updateError"));
        setSaving(false);
        return;
      }
      setSavedName(trimmed);
      setValue(trimmed);
      setJustSaved(true);
      setSaving(false);
      // Refresh so the persona card on this page, the my-team list, and every
      // other surface that reads this name re-render with the new value.
      router.refresh();
    } catch {
      setErrorMessage(t("updateError"));
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {canEdit ? (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!saving && dirty) save();
            }}
          >
            <div className="min-w-[16rem] flex-1">
              <Input
                label={t("label")}
                name="agent-name"
                value={value}
                maxLength={MAX_NAME_LENGTH}
                placeholder={t("placeholder", { default: defaultName })}
                autoComplete="off"
                onChange={(e) => {
                  setValue(e.target.value);
                  setJustSaved(false);
                  setErrorMessage(null);
                }}
              />
            </div>
            <Button type="submit" size="sm" isLoading={saving} disabled={!dirty || !trimmed}>
              {t("saveButton")}
            </Button>
            {justSaved && !dirty ? (
              <span className="pb-2 text-sm text-tertiary-container">{t("savedStatus")}</span>
            ) : null}
          </form>
        ) : (
          <p className="text-sm font-medium text-on-surface">{savedName}</p>
        )}

        {errorMessage ? (
          <p role="alert" className="mt-2 text-sm text-error">
            {errorMessage}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
