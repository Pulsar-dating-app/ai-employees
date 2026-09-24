"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AgentAvatar } from "@/components/agents/agent-avatar";

type PhotoType = "default_1" | "default_2" | "custom";

const MAX_NAME_LENGTH = 60;
const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export function IdentityEditor({
  companyId,
  agentSlug,
  role,
  canEdit,
  initialName,
  defaultName,
  defaultPhotos,
  initialPhoto,
  onSaved,
}: {
  companyId: string;
  agentSlug: string;
  role: string | null;
  canEdit: boolean;
  initialName: string;
  defaultName: string;
  defaultPhotos: readonly [string, string] | null;
  initialPhoto: { photoType: PhotoType; photoAssetUrl: string | null };
  onSaved?: () => void;
}) {
  const t = useTranslations("MyAgents");
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

  const localPreviewUrl = useMemo(() => (selectedFile ? URL.createObjectURL(selectedFile) : null), [selectedFile]);
  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  const customPreviewSrc = localPreviewUrl ?? photoAssetUrl;

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
      onSaved?.();
    } catch {
      setError(t("name.updateError"));
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-5">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[22px] bg-surface-container ring-1 ring-outline-variant/50">
          {headerPhotoSrc ? (
            photoType === "custom" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={headerPhotoSrc} alt={savedName} className="h-full w-full object-cover object-[center_35%]" />
            ) : (
              <Image
                src={headerPhotoSrc}
                alt={savedName}
                fill
                sizes="96px"
                className="object-cover object-[center_35%]"
              />
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <AgentAvatar role="intent" size="lg" />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {canEdit ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!saving && dirty) save();
              }}
            >
              <Input
                id="agent-name"
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
            <p className="text-lg font-semibold text-on-surface">{savedName}</p>
          )}
          {role ? <p className="text-[13px] font-medium text-on-surface-variant">{role}</p> : null}
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-[13px] font-semibold text-on-surface-variant">{t("identity.photoLabel")}</legend>
        <div className="grid grid-cols-3 gap-3">
          {defaultPhotos
            ? defaultPhotos.map((src, i) => {
                const value: PhotoType = i === 0 ? "default_1" : "default_2";
                const selected = photoType === value;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={selected}
                    onClick={() => choosePhoto(value)}
                    className={`flex flex-col items-center gap-2 rounded-2xl border p-3 transition-[border-color,background-color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                      selected
                        ? "border-primary bg-primary-fixed/40"
                        : "border-outline-variant/70 hover:border-primary/40 hover:bg-surface-container-low"
                    } ${!canEdit ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <div className="relative h-16 w-16 overflow-hidden rounded-xl bg-surface-container">
                      <Image src={src} alt="" fill sizes="64px" className="object-cover object-[center_35%]" />
                    </div>
                    <span className="text-[13px] font-medium text-on-surface">
                      {t("photo.defaultLabel", { number: i + 1 })}
                    </span>
                  </button>
                );
              })
            : null}
          <button
            type="button"
            disabled={!canEdit}
            aria-pressed={photoType === "custom"}
            onClick={() => choosePhoto("custom")}
            className={`flex flex-col items-center gap-2 rounded-2xl border p-3 transition-[border-color,background-color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              photoType === "custom"
                ? "border-primary bg-primary-fixed/40"
                : "border-outline-variant/70 hover:border-primary/40 hover:bg-surface-container-low"
            } ${!canEdit ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <div className="relative h-16 w-16 overflow-hidden rounded-xl bg-surface-container">
              {customPreviewSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={customPreviewSrc} alt="" className="h-full w-full object-cover object-[center_35%]" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <AgentAvatar role="locked" size="md" />
                </div>
              )}
            </div>
            <span className="text-[13px] font-medium text-on-surface">{t("photo.customLabel")}</span>
          </button>
        </div>
        {photoType === "custom" ? (
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!canEdit || saving}
              onClick={() => fileInputRef.current?.click()}
            >
              {t("photo.chooseFileButton")}
            </Button>
            <span className="truncate text-sm text-on-surface-variant">
              {selectedFile ? selectedFile.name : photoAssetUrl ? t("photo.currentFileHint") : t("photo.noFileChosen")}
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
      </fieldset>

      {canEdit ? (
        <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-col gap-2 border-t border-outline-variant/50 bg-surface-container-lowest/95 px-6 py-4 backdrop-blur">
          {error ? (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <Button type="button" isLoading={saving} disabled={!dirty} onClick={save}>
              {t("name.saveButton")}
            </Button>
            {savedOk && !dirty ? (
              <span role="status" className="text-sm text-success-500">
                {t("name.savedStatus")}
              </span>
            ) : null}
          </div>
        </div>
      ) : error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
