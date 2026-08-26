"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

// Matches Button's own secondary+sm class string so this <a> (a real
// download link, which Button — a <button> — can't be) looks identical to
// every other secondary button on this page.
const TEMPLATE_LINK_CLASSES =
  "inline-flex items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-50";

type ImportResult = {
  imported: number;
  skippedCount: number;
  skipped: { row: number; reason: string }[];
};

type ImportPanelProps = {
  companyId: string;
  canEdit: boolean;
  onImported: () => void;
};

export function ImportPanel({ companyId, canEdit, onImported }: ImportPanelProps) {
  const t = useTranslations("Products.import");

  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "importing" | "done" | "error">("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImport() {
    if (!file) {
      setError(t("fileRequired"));
      return;
    }

    setError(null);
    setStatus("importing");

    const formData = new FormData();
    formData.set("file", file);

    // No Content-Type header here, unlike every other fetch in this app —
    // the browser sets the multipart boundary itself; setting it manually
    // would break the boundary the server parses against.
    const res = await fetch(`/api/companies/${companyId}/products/import`, {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      const json = await res.json();
      setResult({ imported: json.imported, skippedCount: json.skippedCount, skipped: json.skipped ?? [] });
      setStatus("done");
      onImported();
    } else {
      setStatus("error");
      setError(t("genericError"));
    }
  }

  function reset() {
    setFile(null);
    setResult(null);
    setError(null);
    setStatus("idle");
  }

  if (!canEdit) return null;

  if (status === "done" && result) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-neutral-800">
          {t("resultSummary", { imported: result.imported, skippedCount: result.skippedCount })}
        </p>
        {result.skippedCount > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-500">
                  <th className="py-2 pr-3 font-medium">{t("skippedTableRowHeader")}</th>
                  <th className="py-2 pr-3 font-medium">{t("skippedTableReasonHeader")}</th>
                </tr>
              </thead>
              <tbody>
                {result.skipped.map((row) => (
                  <tr key={row.row} className="border-b border-neutral-100">
                    <td className="py-2 pr-3">{row.row}</td>
                    <td className="py-2 pr-3">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div>
          <Button type="button" variant="secondary" size="sm" onClick={reset}>
            {t("importAnotherButton")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm text-neutral-700">
        <p className="font-medium text-neutral-900">{t("formatTitle")}</p>
        <p className="mt-1 text-neutral-600">{t("formatDescription")}</p>
        <p className="mt-1 text-neutral-600">{t("formatPriceHint")}</p>
        <p className="mt-1 text-neutral-600">{t("formatVariantsHint")}</p>
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
          disabled={status === "importing"}
          onClick={() => fileInputRef.current?.click()}
        >
          {t("chooseFileButton")}
        </Button>
        <span className="text-sm text-neutral-600">{file ? file.name : t("noFileChosen")}</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          disabled={status === "importing"}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div>
        <Button type="button" isLoading={status === "importing"} disabled={!file} onClick={handleImport}>
          {status === "importing" ? t("importingButton") : t("importButton")}
        </Button>
      </div>
    </div>
  );
}
