"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { BadgeCheckIcon } from "@/components/ui/icons";

type PhotoType = "default_1" | "default_2" | "custom";

const MAX_NAME_LENGTH = 60;
const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// The agent detail page's single "Profile" card — merges what used to be
// three cards (persona summary, rename, change photo) into one identity
// surface. Role and description stay read-only (platform data). Name and
// photo edit inline and share ONE save button: it PATCHes the name and/or
// POSTs the photo depending on what actually changed, then refreshes once.
// The mocked "conversations today" stat the old persona card showed is
// dropped here — that number lives on the metrics page.
export function IdentityEditor({
  companyId,
  agentSlug,
  role,
  dbDescription,
  active,
  canEdit,
  initialName,
  defaultName,
  defaultPhotos,
  initialPhoto,
}: {
  companyId: string;
  agentSlug: string;
  role: string | null;
  // Raw `agents.description` DB fallback; the authored `Agents.descriptions.<slug>`
  // copy (with its `{name}` placeholder) is preferred and resolved below.
  dbDescription: string | null;
  active: boolean;
  canEdit: boolean;
  initialName: string;
  defaultName: string;
  // [default_1 src, default_2 src] — always present for a real agent slug.
  defaultPhotos: readonly [string, string] | null;
  initialPhoto: { photoType: PhotoType; photoAssetUrl: string | null };
}) {
  const t = useTranslations("MyAgents");
  const tAgents = useTranslations("Agents");
  const router = useRouter();

  const [nameValue, setNameValue] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);

  const [photoType, setPhotoType] = useState<PhotoType>(initialPhoto.photoType);
  const [savedPhotoType, setSavedPhotoType] = useState<PhotoType>(initialPhoto.photoType);
  const [photoAssetUrl, setPhotoAssetUrl] = useState<string | null>(initialPhoto.photoAssetUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Header portrait tracks the current picker selection so the choice is
  // visible full-size before saving.
  const headerPhotoSrc =
    photoType === "custom"
      ? customPreviewSrc
      : photoType === "default_2"
        ? (defaultPhotos?.[1] ?? null)
        : (defaultPhotos?.[0] ?? null);

  const trimmedName = nameValue.trim();
  const nameDirty = trimmedName.length > 0 && trimmedName !== savedName;
  const photoDirty = photoType !== savedPhotoType || selectedFile !== null;
  const dirty = nameDirty || photoDirty;

  // Blurb follows the name as the merchant types it, so the read-only
  // description never contradicts the name field above it.
  const descKey = `descriptions.${agentSlug}`;
  const blurb = tAgents.has(descKey)
    ? tAgents(descKey, { name: trimmedName || savedName || defaultName })
    : (dbDescription ?? "");

  function choosePhoto(next: PhotoType) {
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
      setError(t("photo.unsupportedFile"));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(t("photo.fileTooLarge"));
      return;
    }
    setSelectedFile(file);
  }

  async function save() {
    if (!trimmedName) {
      setError(t("name.emptyError"));
      return;
    }
    if (photoType === "custom" && !selectedFile && !photoAssetUrl) {
      setError(t("photo.chooseFileError"));
      return;
    }

    setSaving(true);
    setError(null);
    setSavedOk(false);

    try {
      if (nameDirty) {
        const res = await fetch(`/api/companies/${companyId}/agents/${agentSlug}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmedName }),
        });
        if (!res.ok) {
          setError(t("name.updateError"));
          setSaving(false);
          return;
        }
        setSavedName(trimmedName);
        setNameValue(trimmedName);
      }

      if (photoDirty) {
        const formData = new FormData();
        formData.set("photoType", photoType);
        if (selectedFile) formData.set("file", selectedFile);
        const res = await fetch(`/api/companies/${companyId}/agents/${agentSlug}/photo`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          setError(t("photo.saveError"));
          setSaving(false);
          return;
        }
        const json = await res.json();
        setPhotoAssetUrl(json.companyAgent.photo_asset_url ?? null);
        setSavedPhotoType(photoType);
        setSelectedFile(null);
      }

      setSaving(false);
      setSavedOk(true);
      router.refresh();
    } catch {
      setError(t("name.updateError"));
      setSaving(false);
    }
  }

  return (
    <Card data-tour="agent-name">
      <CardHeader>
        <CardTitle>{t("identity.title")}</CardTitle>
        <CardDescription>{t("identity.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Persona header — portrait + name field + read-only role/status */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-outline-variant bg-surface-container">
            {headerPhotoSrc ? (
              photoType === "custom" ? (
                // Arbitrary merchant-uploaded / blob-preview source.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={headerPhotoSrc}
                  alt={savedName}
                  className="h-full w-full object-cover object-[center_35%]"
                />
              ) : (
                <Image
                  src={headerPhotoSrc}
                  alt={savedName}
                  fill
                  sizes="112px"
                  className="object-cover object-[center_35%]"
                />
              )
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <AgentAvatar role="intent" size="lg" />
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-2">
            {canEdit ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!saving && dirty) save();
                }}
              >
                <Input
                  label={t("name.label")}
                  name="agent-name"
                  value={nameValue}
                  maxLength={MAX_NAME_LENGTH}
                  placeholder={t("name.placeholder", { default: defaultName })}
                  autoComplete="off"
                  onChange={(e) => {
                    setNameValue(e.target.value);
                    setSavedOk(false);
                    setError(null);
                  }}
                />
              </form>
            ) : (
              <p className="text-lg font-bold text-on-surface">{savedName}</p>
            )}

            {role ? <p className="text-sm font-medium text-primary">{role}</p> : null}

            <div className="mt-1 flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full bg-surface-container px-3 py-1 text-label-sm font-semibold ${
                  active ? "text-tertiary-container" : "text-on-surface-variant"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${active ? "bg-tertiary-container" : "bg-on-surface-variant"}`}
                />
                {active ? t("activeBadge") : t("pausedBadge")}
              </span>
              <BadgeCheckIcon className="h-4 w-4 text-primary" />
            </div>
          </div>
        </div>

        {blurb ? (
          <p className="text-sm leading-relaxed text-on-surface-variant">{blurb}</p>
        ) : null}

        {/* Photo picker */}
        <div className="border-t border-outline-variant pt-6">
          <p className="mb-3 text-sm font-semibold text-on-surface">{t("identity.photoLabel")}</p>
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
                      onClick={() => choosePhoto(value)}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors ${
                        selected
                          ? "border-primary bg-primary-fixed/30"
                          : "border-outline-variant hover:bg-surface-container-low"
                      } ${!canEdit ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-outline-variant bg-surface-container">
                        <Image src={src} alt="" fill sizes="64px" className="object-cover object-[center_35%]" />
                      </div>
                      <span className="text-xs font-medium text-on-surface">
                        {t("photo.defaultLabel", { number: i + 1 })}
                      </span>
                    </button>
                  );
                })
              : null}

            <button
              type="button"
              disabled={!canEdit}
              onClick={() => choosePhoto("custom")}
              className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors ${
                photoType === "custom"
                  ? "border-primary bg-primary-fixed/30"
                  : "border-outline-variant hover:bg-surface-container-low"
              } ${!canEdit ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-outline-variant bg-surface-container">
                {customPreviewSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={customPreviewSrc} alt="" className="h-full w-full object-cover object-[center_35%]" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <AgentAvatar role="locked" size="md" />
                  </div>
                )}
              </div>
              <span className="text-xs font-medium text-on-surface">{t("photo.customLabel")}</span>
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
                {t("photo.chooseFileButton")}
              </Button>
              <span className="text-sm text-on-surface-variant">
                {selectedFile
                  ? selectedFile.name
                  : photoAssetUrl
                    ? t("photo.currentFileHint")
                    : t("photo.noFileChosen")}
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
        </div>

        {error ? (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        ) : null}

        {canEdit ? (
          <div className="flex items-center gap-3 border-t border-outline-variant pt-6">
            <Button type="button" isLoading={saving} disabled={!dirty} onClick={save}>
              {t("name.saveButton")}
            </Button>
            {savedOk && !dirty ? (
              <span className="text-sm text-tertiary-container">{t("name.savedStatus")}</span>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
