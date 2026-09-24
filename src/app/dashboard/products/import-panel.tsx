"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { ChevronRightIcon, UploadIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

type ValidationResult = {
  skippedCount: number;
  skipped: { row: number; reason: string }[];
};

export type ImportJobStatus = "processing" | "succeeded" | "failed";
export type ImportJob = {
  id: string;
  status: ImportJobStatus;
  totalRows: number;
  insertedCount: number;
};

type ImportPanelProps = {
  companyId: string;
  canEdit: boolean;
  job: ImportJob | null;
  onJobStarted: (job: ImportJob) => void;
  onReset: () => void;
};

const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024;
const ACCEPTED = [".csv", ".xlsx", ".xls"];

export function ImportPanel({ companyId, canEdit, job, onJobStarted, onReset }: ImportPanelProps) {
  const t = useTranslations("Products.import");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function pick(next: File | null) {
    setUploadError(null);
    if (next && !ACCEPTED.some((ext) => next.name.toLowerCase().endsWith(ext))) {
      setUploadError(t("genericError"));
      return;
    }
    if (next && next.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(t("fileTooLarge"));
      return;
    }
    setFile(next);
  }

  async function handleImport() {
    if (!file) {
      setUploadError(t("fileRequired"));
      return;
    }
    setUploadError(null);
    setUploading(true);
    const formData = new FormData();
    formData.set("file", file);
    const res = await fetch(`/api/companies/${companyId}/products/import`, {
      method: "POST",
      body: formData,
    }).catch(() => null);
    setUploading(false);
    if (res?.ok) {
      const json = await res.json();
      setValidation({ skippedCount: json.skippedCount, skipped: json.skipped ?? [] });
      if (json.jobId) {
        onJobStarted({ id: json.jobId, status: "processing", totalRows: json.queued, insertedCount: 0 });
      }
    } else {
      setUploadError(t("genericError"));
    }
  }

  function reset() {
    setFile(null);
    setValidation(null);
    setUploadError(null);
    onReset();
  }

  if (!canEdit) return null;

  if (job) {
    const percent =
      job.totalRows > 0 ? Math.round((Math.min(job.insertedCount, job.totalRows) / job.totalRows) * 100) : 0;
    return (
      <div className="flex flex-col gap-4">
        {job.status === "processing" ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-surface-container-low p-5">
            <p className="text-sm font-semibold text-on-surface" role="status">
              {t("progressLabel", { percent })}
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ width: `${Math.max(2, percent)}%` }}
              />
            </div>
          </div>
        ) : job.status === "succeeded" ? (
          <p role="status" className="rounded-2xl bg-success-100 px-5 py-4 text-sm font-semibold text-success-500">
            {t("succeededSummary", { count: job.totalRows })}
          </p>
        ) : (
          <p role="alert" className="rounded-2xl bg-error-container/60 px-5 py-4 text-sm font-semibold text-error">
            {t("failedSummary")}
          </p>
        )}

        {validation && validation.skippedCount > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-outline-variant/60">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-container-low text-[13px] text-on-surface-variant">
                <tr>
                  <th className="px-4 py-2 font-medium">{t("skippedTableRowHeader")}</th>
                  <th className="px-4 py-2 font-medium">{t("skippedTableReasonHeader")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/40">
                {validation.skipped.map((row) => (
                  <tr key={row.row}>
                    <td className="px-4 py-2 tabular-nums text-on-surface">{row.row}</td>
                    <td className="px-4 py-2 text-on-surface-variant">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {job.status !== "processing" ? (
          <div>
            <Button type="button" variant="secondary" size="sm" onClick={reset}>
              {t("importAnotherButton")}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0] ?? null);
        }}
        className={clsx(
          "flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-9 text-center transition-colors duration-200",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60",
          dragging
            ? "border-primary bg-primary-fixed/50"
            : file
              ? "border-primary/40 bg-primary-fixed/25"
              : "border-outline-variant hover:border-primary/40 hover:bg-surface-container-low",
        )}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-fixed text-primary">
          <UploadIcon className="h-5 w-5" />
        </span>
        {file ? (
          <>
            <span className="max-w-full truncate text-sm font-semibold text-on-surface">{file.name}</span>
            <span className="text-[13px] text-primary">{t("chooseFileButton")}</span>
          </>
        ) : (
          <>
            <span className="text-sm font-semibold text-on-surface">{t("dropTitle")}</span>
            <span className="text-[13px] text-on-surface-variant">{t("dropBody")}</span>
          </>
        )}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        disabled={uploading}
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
        className="hidden"
      />

      {uploadError ? (
        <p role="alert" className="text-sm text-error">
          {uploadError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" isLoading={uploading} disabled={!file} onClick={handleImport}>
          {uploading ? t("importingButton") : t("importButton")}
        </Button>
        <a
          href={`/api/companies/${companyId}/products/import-template`}
          className="inline-flex h-9 items-center rounded-xl px-2 text-sm font-semibold text-primary transition-colors hover:bg-primary-fixed/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {t("downloadTemplateButton")}
        </a>
      </div>

      <details className="group rounded-2xl bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-on-surface [&::-webkit-details-marker]:hidden">
          <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 group-open:rotate-90" />
          {t("formatToggle")}
        </summary>
        <div className="mt-3 flex flex-col gap-2 pl-6 leading-6">
          <p>{t("formatDescription")}</p>
          <p>{t("formatPriceHint")}</p>
          <p>{t("formatDescriptionHint")}</p>
          <p>{t("formatSizeHint")}</p>
        </div>
      </details>
    </div>
  );
}
