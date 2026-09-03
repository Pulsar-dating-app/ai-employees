"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { FIELD_CLASSES, FIELD_LABEL_CLASSES } from "./input";
import { CHEVRON } from "./select";

export type ComboboxOption = { value: string; label: string };

type ComboboxProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  disabled?: boolean;
  error?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
};

// A filtered single-select for lists too long for a native <select> (the
// country picker). Dependency-free: a styled trigger button + an absolutely
// positioned panel with a search box and a scrollable option list. Closes on
// outside click / Escape; basic arrow-key + Enter navigation in the list.
export function Combobox({
  label,
  value,
  onChange,
  options,
  disabled,
  error,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches",
  className,
}: ComboboxProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((o) => o.value === value) ?? null;
  // A stored value with no matching option (e.g. a legacy free-text country)
  // still shows, so the field never looks empty when it isn't.
  const triggerLabel = selected?.label ?? (value || placeholder);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => searchRef.current?.focus());
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("mousedown", onDocClick);
    };
  }, [open]);

  function toggleOpen() {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
    }
    setOpen(!open);
  }

  function commit(next: string) {
    onChange(next);
    setOpen(false);
  }

  function onSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[activeIndex];
      if (pick) commit(pick.value);
    }
  }

  return (
    <div className={clsx("flex flex-col gap-1.5", className)} ref={rootRef}>
      {label ? <span className={FIELD_LABEL_CLASSES}>{label}</span> : null}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={toggleOpen}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={clsx(
            FIELD_CLASSES,
            CHEVRON,
            "text-left",
            error && "ring-2 ring-error/50",
            !selected && !value && "text-outline",
          )}
        >
          {triggerLabel}
        </button>

        {open ? (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-outline-variant bg-surface-container-lowest shadow-level2">
            <div className="p-2">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onSearchKeyDown}
                placeholder={searchPlaceholder}
                className={clsx(FIELD_CLASSES, "py-2")}
                aria-controls={listId}
              />
            </div>
            <ul id={listId} role="listbox" className="max-h-60 overflow-auto pb-1">
              {filtered.length === 0 ? (
                <li className="px-4 py-2 text-sm text-on-surface-variant">{emptyText}</li>
              ) : (
                filtered.map((option, index) => (
                  <li key={option.value} role="option" aria-selected={option.value === value}>
                    <button
                      type="button"
                      onClick={() => commit(option.value)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={clsx(
                        "block w-full px-4 py-2 text-left text-sm text-on-surface",
                        index === activeIndex && "bg-surface-container",
                        option.value === value && "font-semibold text-primary",
                      )}
                    >
                      {option.label}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
