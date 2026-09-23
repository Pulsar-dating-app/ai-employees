"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

const CURRENT = "#4f46e5";
const PREVIOUS = "#86839a";
const HEIGHT = 290;
const PAD = { top: 12, right: 12, bottom: 28, left: 40 };

export type ChartPoint = {
  date: string;
  end?: string;
  current: number;
  previous: number | null;
};

function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * magnitude >= value) return step * magnitude;
  }
  return 10 * magnitude;
}

export function ConversationsChart({
  points,
  granularity,
  rangeDays,
}: {
  points: ChartPoint[];
  granularity: "day" | "week";
  rangeDays: number;
}) {
  const t = useTranslations("Metrics.view");
  const locale = useLocale();
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setMeasured(Math.max(280, entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const width = measured ?? 0;
  const hasPrevious = points.some((p) => p.previous !== null);
  const peak = Math.max(1, ...points.map((p) => Math.max(p.current, p.previous ?? 0)));
  const yMax = niceMax(peak);
  const ticks = [0, yMax / 2, yMax];
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;

  const dateFmt = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });
  const fmtDate = (d: string) => dateFmt.format(new Date(`${d}T12:00:00Z`));
  const labelFor = (p: ChartPoint) =>
    p.end ? t("weekOf", { start: fmtDate(p.date), end: fmtDate(p.end) }) : fmtDate(p.date);
  const numberFmt = new Intl.NumberFormat(locale);

  const linePath = (values: (number | null)[]) =>
    values
      .map((v, i) => (v === null ? null : `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .join(" ");
  const currentLine = linePath(points.map((p) => p.current));
  const areaPath =
    points.length > 0 ? `${currentLine} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : "";
  const previousLine = hasPrevious ? linePath(points.map((p) => p.previous)) : "";

  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 90))));
  const xLabels = points
    .map((p, i) => ({ i, d: p.date }))
    .filter(({ i }) => i % labelEvery === 0 || i === points.length - 1)
    .filter(({ i }, k, arr) => !(k === arr.length - 2 && arr[arr.length - 1].i - i < labelEvery * 0.6));

  function onMove(clientX: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || points.length === 0) return;
    const rel = clientX - rect.left - PAD.left;
    const i = Math.round((rel / innerW) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  }

  const active = hover !== null ? points[hover] : null;
  const tipOnLeft = hover !== null && x(hover) > width / 2;
  const tipLeft = hover !== null ? x(hover) + (tipOnLeft ? -12 : 12) : 0;

  return (
    <div className="flex flex-col gap-3">
      {hasPrevious ? (
        <div className="flex flex-wrap items-center gap-4 text-[13px] text-on-surface-variant">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full" style={{ background: CURRENT }} />
            {t("current")}
          </span>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full" style={{ background: PREVIOUS }} />
            {t("previous", { days: rangeDays })}
          </span>
        </div>
      ) : null}

      <div
        ref={wrapRef}
        className="relative touch-pan-y"
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
        onPointerDown={(e) => onMove(e.clientX)}
      >
        {measured === null ? (
          <div style={{ height: HEIGHT }} />
        ) : (
          <svg width={width} height={HEIGHT} role="img" aria-labelledby={`${id}-caption`} className="block">
            <defs>
              <clipPath id={`${id}-reveal`}>
                <rect x="0" y="0" height={HEIGHT} width={width} className="metrics-reveal" />
              </clipPath>
            </defs>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#e7e8e9" strokeWidth={1} />
                <text
                  x={PAD.left - 8}
                  y={y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-outline text-[11px] tabular-nums"
                >
                  {numberFmt.format(tick)}
                </text>
              </g>
            ))}
            {xLabels.map(({ i, d }) => (
              <text
                key={d}
                x={x(i)}
                y={HEIGHT - 8}
                textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
                className="fill-outline text-[11px]"
              >
                {fmtDate(d)}
              </text>
            ))}
            <g clipPath={`url(#${id}-reveal)`}>
              {previousLine ? (
                <path
                  d={previousLine}
                  fill="none"
                  stroke={PREVIOUS}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              <path d={areaPath} fill={CURRENT} fillOpacity={0.1} />
              <path
                d={currentLine}
                fill="none"
                stroke={CURRENT}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
            {active && hover !== null ? (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={y(0)} stroke="#c7c4d8" strokeWidth={1} />
                {active.previous !== null ? (
                  <circle
                    cx={x(hover)}
                    cy={y(active.previous)}
                    r={4}
                    fill={PREVIOUS}
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                ) : null}
                <circle cx={x(hover)} cy={y(active.current)} r={4.5} fill={CURRENT} stroke="#ffffff" strokeWidth={2} />
              </g>
            ) : null}
          </svg>
        )}

        {active ? (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute top-0 z-10 min-w-40 whitespace-nowrap rounded-xl ${tipOnLeft ? "-translate-x-full" : ""} bg-surface-container-lowest px-3 py-2.5 shadow-[0_8px_24px_-8px_rgba(25,28,29,0.25)] ring-1 ring-outline-variant/60`}
            style={{ left: tipLeft }}
          >
            <p className="text-[12px] text-on-surface-variant">{labelFor(active)}</p>
            <p className="mt-1 flex items-center gap-2">
              <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: CURRENT }} />
              <span className="text-[15px] font-semibold tabular-nums text-on-surface">
                {numberFmt.format(active.current)}
              </span>
              <span className="text-[12px] text-on-surface-variant">{t("current")}</span>
            </p>
            {active.previous !== null ? (
              <p className="mt-0.5 flex items-center gap-2">
                <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: PREVIOUS }} />
                <span className="text-[15px] font-semibold tabular-nums text-on-surface">
                  {numberFmt.format(active.previous)}
                </span>
                <span className="text-[12px] text-on-surface-variant">{t("previous", { days: rangeDays })}</span>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <table className="sr-only">
        <caption id={`${id}-caption`}>{t("tableCaption", { unit: granularity })}</caption>
        <thead>
          <tr>
            <th scope="col">{t("tableDate")}</th>
            <th scope="col">{t("current")}</th>
            {hasPrevious ? <th scope="col">{t("previous", { days: rangeDays })}</th> : null}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <th scope="row">{labelFor(p)}</th>
              <td>{p.current}</td>
              {hasPrevious ? <td>{p.previous ?? 0}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
