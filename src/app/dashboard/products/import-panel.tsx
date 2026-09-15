"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

// Matches Button's own secondary+sm class string so this <a> (a real
// download link, which Button — a <button> — can't be) looks identical to
// every other secondary button on this page.
// Kept in sync with Button's `secondary` + `sm` styling by hand — this has
// to be a real <a> (download link), which Button (a <button>) can't be.
const TEMPLATE_LINK_CLASSES =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-outline-variant bg-surface-container px-4 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-high";

// What's known synchronously, from the import POST's own response — how
// many valid rows were queued and which rows were skipped at validation.
// Only ever populated by *this* browser tab actually submitting a file, so
// it's absent after a reload resumes an in-progress job (see below).
type ValidationResult = {
  skippedCount: number;
  skipped: { row: number; reason: string }[];
};

// Mirrors product_import_jobs (migration 20260915120000) / GET
// .../import/status's response shape. `insertedCount` on a `failed` job is
// diagnostic only — the route's compensating rollback means none of those
// rows actually survive, so the UI must key off `status`, never treat
// `insertedCount` as a real partial result.
type JobStatus = "processing" | "succeeded" | "failed";
type Job = {
  id: string;
  status: JobStatus;
  totalRows: number;
  insertedCount: number;
};

type ImportPanelProps = {
  companyId: string;
  canEdit: boolean;
  onImported: () => void;
};

const POLL_INTERVAL_MS = 1200;
// Kept in sync by hand with MAX_FILE_SIZE_BYTES in the import route (see
// that constant's own comment for why 3MB — Vercel's real request-body
// ceiling is 4.5MB, not configurable). Checked here too so an oversized
// file is rejected instantly, client-side, instead of only after a full
// upload round-trip just to be told it was too big.
const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024;

async function fetchLatestJob(companyId: string): Promise<Job | null> {
  const res = await fetch(`/api/companies/${companyId}/products/import/status`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.job ?? null;
}

export function ImportPanel({ companyId, canEdit, onImported }: ImportPanelProps) {
  const t = useTranslations("Products.import");

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resume on mount: if there's a job at all for this company — still
  // running, or finished since the last time this tab looked — show it
  // instead of defaulting to a blank upload form, so leaving the page (or
  // just reloading) doesn't lose the only sign an import ever happened.
  useEffect(() => {
    let cancelled = false;
    fetchLatestJob(companyId).then((latest) => {
      if (!cancelled && latest) setJob(latest);
    });
    return () => {
      cancelled = true;
    };
    // One-time resume on mount — not meant to re-run except if the company
    // itself changes.
  }, [companyId]);

  // Poll only while a job is actually processing; stops itself the moment
  // it reaches a terminal status (or this panel unmounts).
  useEffect(() => {
    if (!job || job.status !== "processing") return;

    const interval = setInterval(async () => {
      const latest = await fetchLatestJob(companyId);
      if (!latest) return;
      setJob(latest);
      if (latest.status !== "processing") {
        // Only now, not on the mount-time resume above — a plain page visit
        // that happens to find an old finished job shouldn't itself trigger
        // a product-list refresh; watching one actually finish should.
        onImported();
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [job, companyId, onImported]);

  async function handleImport() {
    if (!file) {
      setUploadError(t("fileRequired"));
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(t("fileTooLarge"));
      return;
    }

    setUploadError(null);
    setUploading(true);

    const formData = new FormData();
    formData.set("file", file);

    // No Content-Type header here, unlike every other fetch in this app —
    // the browser sets the multipart boundary itself; setting it manually
    // would break the boundary the server parses against.
    const res = await fetch(`/api/companies/${companyId}/products/import`, {
      method: "POST",
      body: formData,
    });

    setUploading(false);

    if (res.ok) {
      const json = await res.json();
      setValidation({ skippedCount: json.skippedCount, skipped: json.skipped ?? [] });
      if (json.jobId) {
        setJob({ id: json.jobId, status: "processing", totalRows: json.queued, insertedCount: 0 });
      }
    } else {
      setUploadError(t("genericError"));
    }
  }

  function reset() {
    setFile(null);
    setValidation(null);
    setJob(null);
    setUploadError(null);
  }

  if (!canEdit) return null;

  if (job) {
    const percent =
      job.totalRows > 0 ? Math.round((Math.min(job.insertedCount, job.totalRows) / job.totalRows) * 100) : 0;

    return (
      <div className="flex flex-col gap-3">
        {job.status === "processing" ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-neutral-800">{t("progressLabel", { percent })}</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.max(2, percent)}%` }}
              />
            </div>
          </div>
        ) : job.status === "succeeded" ? (
          <p className="text-sm text-neutral-800">{t("succeededSummary", { count: job.totalRows })}</p>
        ) : (
          // No count shown here on purpose — a failed run means zero
          // products were actually kept (compensating rollback), so
          // surfacing insertedCount would misreport a partial success.
          <p className="text-sm text-error">{t("failedSummary")}</p>
        )}

        {validation && validation.skippedCount > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-500">
                  <th className="py-2 pr-3 font-medium">{t("skippedTableRowHeader")}</th>
                  <th className="py-2 pr-3 font-medium">{t("skippedTableReasonHeader")}</th>
                </tr>
              </thead>
              <tbody>
                {validation.skipped.map((row) => (
                  <tr key={row.row} className="border-b border-neutral-100">
                    <td className="py-2 pr-3">{row.row}</td>
                    <td className="py-2 pr-3">{row.reason}</td>
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
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-outline-variant bg-surface-container-low px-3 py-3 text-sm text-on-surface-variant">
        <p className="font-semibold text-on-surface">{t("formatTitle")}</p>
        <p className="mt-1">{t("formatDescription")}</p>
        <p className="mt-1">{t("formatPriceHint")}</p>
        <p className="mt-1">{t("formatDescriptionHint")}</p>
        <p className="mt-1">{t("formatSizeHint")}</p>
        <div className="mt-2">
          <a href={`/api/companies/${companyId}/products/import-template`} className={TEMPLATE_LINK_CLASSES}>
            {t("downloadTemplateButton")}
          </a>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {t("chooseFileButton")}
        </Button>
        <span className="text-sm text-neutral-600">{file ? file.name : t("noFileChosen")}</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          disabled={uploading}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
      </div>

      {uploadError ? (
        <p role="alert" className="text-sm text-error">
          {uploadError}
        </p>
      ) : null}

      <div>
        <Button type="button" isLoading={uploading} disabled={!file} onClick={handleImport}>
          {uploading ? t("importingButton") : t("importButton")}
        </Button>
      </div>
    </div>
  );
}
