// Minimal inline-SVG trend line — no charting library (the repo has none,
// and the F6 card only asks for "a small chart or sparkline per metric").
// Pure/presentational: colour comes from `currentColor`, so the parent sets
// it. Scales to any box via preserveAspectRatio="none" + non-scaling stroke.

const VIEW_W = 100;
const VIEW_H = 32;

export function Sparkline({
  points,
  className,
}: {
  points: number[];
  className?: string;
}) {
  if (points.length === 0) return null;

  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const stepX = points.length > 1 ? VIEW_W / (points.length - 1) : 0;

  const coords = points.map((value, i) => {
    const x = points.length > 1 ? i * stepX : VIEW_W / 2;
    const y = VIEW_H - ((value - min) / range) * VIEW_H;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c}`).join(" ");
  const area = `${line} L${VIEW_W},${VIEW_H} L0,${VIEW_H} Z`;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <path d={area} fill="currentColor" fillOpacity={0.12} />
      <path
        className="metrics-spark-draw"
        d={line}
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
