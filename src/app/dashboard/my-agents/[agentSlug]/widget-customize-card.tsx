"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { VideoIcon, ImageIcon } from "@/components/ui/icons";

type LauncherType = "default" | "video" | "image" | "mascot";

// The bundled mascot clip, shown in the preview. widget.js loads the same
// file (plus a Safari-only .mov sibling) on the merchant's own site.
const MASCOT_PREVIEW_SRC = "/mascot-greeting-with-bubble.webm";

const VIDEO_ACCEPT = "video/webm,video/mp4";
const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const MAX_VIDEO_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// Customize screen (Stitch "Customize Embedded Agent - Admin Workspace") --
// replaces the old static "here's your embed code" half of the agent's
// Connections page with an actual editor: pick the launcher bubble's look
// (the shared default animation, or a merchant's own video/image), set the
// greeting, see both live before saving. WebChatChannelCard (sibling, same
// page) keeps rendering the actual copyable snippet from the *saved* state --
// this card is the editor, not the source of truth for what gets pasted.
export function WidgetCustomizeCard({
  companyId,
  agentSlug,
  agentName,
  canEdit,
  initial,
}: {
  companyId: string;
  agentSlug: string;
  agentName: string;
  canEdit: boolean;
  initial: {
    greeting: string | null;
    launcherType: LauncherType;
    launcherAssetUrl: string | null;
  };
}) {
  const t = useTranslations("MyAgents.widgetCustomize");
  const router = useRouter();

  const [launcherType, setLauncherType] = useState<LauncherType>(initial.launcherType);
  const [launcherAssetUrl, setLauncherAssetUrl] = useState<string | null>(initial.launcherAssetUrl);
  const [greeting, setGreeting] = useState(initial.greeting ?? "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Instant local preview of a just-picked file, before it's ever uploaded --
  // revoked on unmount/replacement so it doesn't leak.
  const localPreviewUrl = useMemo(
    () => (selectedFile ? URL.createObjectURL(selectedFile) : null),
    [selectedFile],
  );
  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  const previewSrc =
    launcherType === "default"
      ? "/widget-launcher.webm"
      : launcherType === "mascot"
        ? MASCOT_PREVIEW_SRC
        : (localPreviewUrl ?? launcherAssetUrl);

  // Only "video" / "image" take a merchant upload. "default" and "mascot"
  // both use a bundled shared asset.
  const needsFile = launcherType === "video" || launcherType === "image";

  function chooseLauncher(next: LauncherType) {
    setLauncherType(next);
    setSelectedFile(null);
    setError(null);
    setSavedOk(false);
  }

  function handleFileChange(file: File | null) {
    setSavedOk(false);
    setError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const maxBytes = launcherType === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    const accept = launcherType === "video" ? VIDEO_ACCEPT : IMAGE_ACCEPT;
    if (!accept.split(",").includes(file.type)) {
      setError(launcherType === "video" ? t("unsupportedFileVideo") : t("unsupportedFileImage"));
      return;
    }
    if (file.size > maxBytes) {
      setError(launcherType === "video" ? t("fileTooLargeVideo") : t("fileTooLargeImage"));
      return;
    }
    setSelectedFile(file);
  }

  async function save() {
    if (needsFile && !selectedFile && !launcherAssetUrl) {
      setError(t("chooseFileError"));
      return;
    }

    setSaving(true);
    setError(null);
    setSavedOk(false);

    const formData = new FormData();
    formData.set("launcherType", launcherType);
    formData.set("greeting", greeting);
    if (selectedFile) formData.set("file", selectedFile);

    try {
      const res = await fetch(`/api/companies/${companyId}/agents/${agentSlug}/widget`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        setError(t("saveError"));
        setSaving(false);
        return;
      }
      const json = await res.json();
      setLauncherAssetUrl(json.companyAgent.widget_launcher_asset_url ?? null);
      setSelectedFile(null);
      setSaving(false);
      setSavedOk(true);
      // Refreshes WebChatChannelCard's snippet (built server-side from the
      // now-saved row) without this card losing its own local edit state.
      router.refresh();
    } catch {
      setError(t("saveError"));
      setSaving(false);
    }
  }

  const launcherOptions: {
    value: LauncherType;
    icon: typeof VideoIcon;
    label: string;
    hint: string;
    beta?: boolean;
  }[] = [
    { value: "default", icon: VideoIcon, label: t("launcherDefault"), hint: t("launcherDefaultHint", { name: agentName }) },
    { value: "video", icon: VideoIcon, label: t("launcherVideo"), hint: t("launcherVideoHint") },
    { value: "image", icon: ImageIcon, label: t("launcherImage"), hint: t("launcherImageHint") },
    { value: "mascot", icon: VideoIcon, label: t("launcherMascot"), hint: t("launcherMascotHint"), beta: true },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description", { name: agentName })}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
          <div className="flex flex-col gap-6">
            <div>
              <p className="mb-3 text-sm font-semibold text-on-surface">{t("launcherSectionTitle")}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {launcherOptions.map((option) => {
                  const Icon = option.icon;
                  const selected = launcherType === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-3 transition-colors ${
                        selected
                          ? "border-primary bg-primary-fixed/30"
                          : "border-outline-variant hover:bg-surface-container-low"
                      } ${!canEdit ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <input
                        type="radio"
                        name="launcherType"
                        className="sr-only"
                        checked={selected}
                        disabled={!canEdit}
                        onChange={() => chooseLauncher(option.value)}
                      />
                      <Icon className={`h-5 w-5 ${selected ? "text-primary" : "text-on-surface-variant"}`} />
                      <span className="flex items-center gap-1.5 text-sm font-medium text-on-surface">
                        {option.label}
                        {option.beta ? (
                          <span className="rounded-full bg-tertiary-container px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-on-tertiary-container">
                            {t("launcherBetaBadge")}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-on-surface-variant">{option.hint}</span>
                    </label>
                  );
                })}
              </div>

              {needsFile ? (
                <div className="mt-3 flex items-center gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!canEdit || saving}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {t("chooseFileButton")}
                  </Button>
                  <span className="text-sm text-on-surface-variant">
                    {selectedFile
                      ? selectedFile.name
                      : launcherAssetUrl
                        ? t("currentFileHint")
                        : t("noFileChosen")}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={launcherType === "video" ? VIDEO_ACCEPT : IMAGE_ACCEPT}
                    disabled={!canEdit || saving}
                    onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-on-surface" htmlFor="widget-greeting">
                {t("greetingLabel")}
              </label>
              <input
                id="widget-greeting"
                type="text"
                value={greeting}
                disabled={!canEdit || saving}
                placeholder={t("greetingPlaceholder")}
                onChange={(e) => {
                  setGreeting(e.target.value);
                  setSavedOk(false);
                }}
                className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <p className="mt-1.5 text-xs text-on-surface-variant">{t("greetingHint")}</p>
            </div>

            {error ? (
              <p role="alert" className="text-sm text-error">
                {error}
              </p>
            ) : null}

            {canEdit ? (
              <div className="flex items-center gap-3">
                <Button type="button" isLoading={saving} onClick={save}>
                  {saving ? t("savingButton") : t("saveButton")}
                </Button>
                {savedOk ? <span className="text-sm text-tertiary">{t("saved")}</span> : null}
              </div>
            ) : null}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
              {t("previewTitle")}
            </p>
            <div
              className="relative h-64 overflow-hidden rounded-lg border border-outline-variant bg-surface-container-low"
              style={{ backgroundImage: "radial-gradient(#d9dadb 1px, transparent 1px)", backgroundSize: "14px 14px" }}
            >
              {launcherType === "mascot" ? (
                // The mascot fills the corner rather than sitting in the
                // launcher circle -- its own baked speech bubble replaces
                // the greeting bubble, so that's hidden here too.
                <video
                  src={previewSrc ?? undefined}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="absolute bottom-0 right-0 h-full w-auto max-w-full object-contain object-right-bottom"
                />
              ) : (
                <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2">
                  {greeting ? (
                    <div className="max-w-[180px] rounded-2xl rounded-br-sm border border-outline-variant bg-surface-container-lowest px-3 py-2 text-xs text-on-surface shadow-level1">
                      {greeting}
                    </div>
                  ) : null}
                  <div className="h-16 w-16 overflow-hidden rounded-full border border-outline-variant bg-surface-container-lowest shadow-level1">
                    {previewSrc ? (
                      launcherType === "image" ? (
                        // Arbitrary merchant-uploaded/blob-preview source, not a static
                        // build asset next/image can optimize.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={previewSrc} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <video src={previewSrc} autoPlay loop muted playsInline className="h-full w-full object-cover" />
                      )
                    ) : null}
                  </div>
                </div>
              )}
            </div>
            {launcherType === "mascot" ? (
              <p className="mt-2 text-xs text-on-surface-variant">{t("launcherMascotNote")}</p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
