"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type KeyValues = Record<string, string[]>;

type Row = {
  id: string;
  key: string;
  values: string[];
  draftValue: string;
};

let rowIdCounter = 0;
function nextRowId(): string {
  rowIdCounter += 1;
  return `row-${rowIdCounter}`;
}

function toRows(value: unknown): Row[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).map(([key, v]) => ({
    id: nextRowId(),
    key,
    values: Array.isArray(v) ? v.map(String) : v != null ? [String(v)] : [],
    draftValue: "",
  }));
}

function toKeyValues(rows: Row[]): KeyValues | null {
  const result: KeyValues = {};
  for (const row of rows) {
    const key = row.key.trim();
    const values = row.values.map((v) => v.trim()).filter(Boolean);
    if (key && values.length > 0) result[key] = values;
  }
  return Object.keys(result).length > 0 ? result : null;
}

// Normalizes any raw stored value (old freeform JSON, a plain object, or
// null/undefined) into the KeyValues shape this editor works with — use
// this to seed a form's own state so it always starts in sync with what
// the editor will render, without waiting for a first onChange.
export function normalizeKeyValues(value: unknown): KeyValues | null {
  return toKeyValues(toRows(value));
}

type KeyValuesEditorProps = {
  initialValue: unknown;
  onChange: (value: KeyValues | null) => void;
  keyLabel: string;
  keyPlaceholder: string;
  valuePlaceholder: string;
  addValueButton: string;
  addRowButton: string;
  removeRowButton: string;
  removeValueLabel: string;
  emptyState: string;
};

// Structured key -> multiple-values editor (e.g. Color: Blue, Red, Green),
// replacing a raw JSON textarea for product "variants" and "attributes".
// Rows are kept as local UI state, not just the derived plain object, so an
// in-progress empty key or draft value survives re-renders — same reason
// FaqSection keeps its own `entries` state rather than deriving from props
// on every render.
export function KeyValuesEditor({
  initialValue,
  onChange,
  keyLabel,
  keyPlaceholder,
  valuePlaceholder,
  addValueButton,
  addRowButton,
  removeRowButton,
  removeValueLabel,
  emptyState,
}: KeyValuesEditorProps) {
  const [rows, setRows] = useState<Row[]>(() => toRows(initialValue));

  function commit(next: Row[]) {
    setRows(next);
    onChange(toKeyValues(next));
  }

  function updateKey(id: string, key: string) {
    commit(rows.map((r) => (r.id === id ? { ...r, key } : r)));
  }

  function updateDraft(id: string, draftValue: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, draftValue } : r)));
  }

  function addValue(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const value = row.draftValue.trim();
    if (!value || row.values.includes(value)) {
      commit(rows.map((r) => (r.id === id ? { ...r, draftValue: "" } : r)));
      return;
    }
    commit(rows.map((r) => (r.id === id ? { ...r, values: [...r.values, value], draftValue: "" } : r)));
  }

  function removeValue(id: string, index: number) {
    commit(rows.map((r) => (r.id === id ? { ...r, values: r.values.filter((_, i) => i !== index) } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { id: nextRowId(), key: "", values: [], draftValue: "" }]);
  }

  function removeRow(id: string) {
    commit(rows.filter((r) => r.id !== id));
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 ? <p className="text-sm text-neutral-500">{emptyState}</p> : null}

      {rows.map((row) => (
        <div key={row.id} className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3">
          <Input
            label={keyLabel}
            placeholder={keyPlaceholder}
            value={row.key}
            onChange={(e) => updateKey(row.id, e.target.value)}
          />

          {row.values.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {row.values.map((value, index) => (
                <span
                  key={`${value}-${index}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700"
                >
                  {value}
                  <button
                    type="button"
                    onClick={() => removeValue(row.id, index)}
                    aria-label={removeValueLabel}
                    className="text-neutral-400 hover:text-neutral-700"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Input
                placeholder={valuePlaceholder}
                value={row.draftValue}
                onChange={(e) => updateDraft(row.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addValue(row.id);
                  }
                }}
              />
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => addValue(row.id)}>
              {addValueButton}
            </Button>
          </div>

          <div>
            <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(row.id)}>
              {removeRowButton}
            </Button>
          </div>
        </div>
      ))}

      <div>
        <Button type="button" variant="secondary" size="sm" onClick={addRow}>
          {addRowButton}
        </Button>
      </div>
    </div>
  );
}
