"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AgentAvatar } from "@/components/agents/agent-avatar";

type PhotoType = "default_1" | "default_2" | "custom";

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// Same shape as WidgetCustomizeCard (pick a type, optionally upload a
// replacement file, save both in one POST) but the picker itself shows real
// thumbnails rather than icons -- for a photo specifically, seeing the
// actual image *is* the preview, so there's no separate "live preview" pane
// the way the widget card needs one for its launcher bubble mockup.
export function PhotoCard({
  companyId,
  agentSlug,
  agentName,
  canEdit,
  defaultPhotos,
  initial,
}: {
  companyId: string;
  agentSlug: string;
  agentName: string;
  canEdit: boolean;
  // [default_1 src, default_2 src] -- always present for a real agent slug
  // (see src/lib/agents/media.ts); the picker just has two fewer tiles if
  // somehow absent, never crashes.
  defaultPhotos: readonly [string, string] | null;
  initial: { photoType: PhotoType; photoAssetUrl: string | null };
}) {
  const t = useTranslations("MyAgents.photo");
  const router = useRouter();

  const [photoType, setPhotoType] = useState<PhotoType>(initial.photoType);
  const [photoAssetUrl, setPhotoAssetUrl] = useState<string | null>(initial.photoAssetUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const localPreviewUrl = useMemo(
    () => (selectedFile ? URL.createObjectURL(selectedFile) : null),
    [selectedFile],
  );
  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  const customPreviewSrc = localPreviewUrl ?? photoAssetUrl;

  function choose(next: PhotoType) {
    setPhotoType(next);
    setError(null);
    setSavedOk(false);
    if (next !== "custom") setSelectedFile(null);
  }

  function handleFileChange(file: File | null) {
    setSavedOk(false);
    setError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (!IMAGE_ACCEPT.split(",").includes(file.type)) {
      setError(t("unsupportedFile"));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(t("fileTooLarge"));
      return;
    }
    setSelectedFile(file);
  }

  async function save() {
    if (photoType === "custom" && !selectedFile && !photoAssetUrl) {
      setError(t("chooseFileError"));
      return;
    }

    setSaving(true);
    setError(null);
    setSavedOk(false);

    const formData = new FormData();
    formData.set("photoType", photoType);
    if (selectedFile) formData.set("file", selectedFile);

    try {
      const res = await fetch(`/api/companies/${companyId}/agents/${agentSlug}/photo`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        setError(t("saveError"));
        setSaving(false);
        return;
      }
      const json = await res.json();
      setPhotoAssetUrl(json.companyAgent.photo_asset_url ?? null);
      setSelectedFile(null);
      setSaving(false);
      setSavedOk(true);
      // Refreshes the persona card above (server-rendered from the now-saved
      // row) without this card losing its own local edit state.
      router.refresh();
    } catch {
      setError(t("saveError"));
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description", { name: agentName })}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 sm:max-w-md">
          {defaultPhotos
            ? defaultPhotos.map((src, i) => {
                const value: PhotoType = i === 0 ? "default_1" : "default_2";
                const selected = photoType === value;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => choose(value)}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors ${
                      selected
                        ? "border-primary bg-primary-fixed/30"
                        : "border-outline-variant hover:bg-surface-container-low"
                    } ${!canEdit ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <div className="relative h-16 w-16 overflow-hidden rounded-full border border-outline-variant bg-surface-container">
                      <Image src={src} alt="" fill sizes="64px" className="object-cover object-top" />
                    </div>
                    <span className="text-xs font-medium text-on-surface">
                      {t("defaultLabel", { number: i + 1 })}
                    </span>
                  </button>
                );
              })
            : null}

          <button
            type="button"
            disabled={!canEdit}
            onClick={() => choose("custom")}
            className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors ${
              photoType === "custom"
                ? "border-primary bg-primary-fixed/30"
                : "border-outline-variant hover:bg-surface-container-low"
            } ${!canEdit ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <div className="relative h-16 w-16 overflow-hidden rounded-full border border-outline-variant bg-surface-container">
              {customPreviewSrc ? (
                // Arbitrary merchant-uploaded/blob-preview source, not a
                // static build asset next/image can optimize.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={customPreviewSrc} alt="" className="h-full w-full object-cover object-top" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <AgentAvatar role="locked" size="md" />
                </div>
              )}
            </div>
            <span className="text-xs font-medium text-on-surface">{t("customLabel")}</span>
          </button>
        </div>

        {photoType === "custom" ? (
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
              {selectedFile ? selectedFile.name : photoAssetUrl ? t("currentFileHint") : t("noFileChosen")}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept={IMAGE_ACCEPT}
              disabled={!canEdit || saving}
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 text-sm text-error">
            {error}
          </p>
        ) : null}

        {canEdit ? (
          <div className="mt-4 flex items-center gap-3">
            <Button type="button" size="sm" isLoading={saving} onClick={save}>
              {saving ? t("savingButton") : t("saveButton")}
            </Button>
            {savedOk ? <span className="text-sm text-tertiary">{t("saved")}</span> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
