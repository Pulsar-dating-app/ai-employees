export function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M16.704 5.29a1 1 0 010 1.415l-7.25 7.25a1 1 0 01-1.415 0l-3.25-3.25a1 1 0 111.415-1.414l2.543 2.543 6.543-6.543a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M5.293 5.293a1 1 0 011.414 0L10 8.586l3.293-3.293a1 1 0 111.414 1.414L11.414 10l3.293 3.293a1 1 0 01-1.414 1.414L10 11.414l-3.293 3.293a1 1 0 01-1.414-1.414L8.586 10 5.293 6.707a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// Outline nav icon family — 24x24, stroke 1.75, round caps/joins. Kept
// visually distinct from the small filled status glyphs above (check/x):
// two different jobs, navigation vs. state, each internally consistent.
const NAV_ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function GridIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function UsersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3 20c0-3.59 2.686-6 6-6s6 2.41 6 6" />
      <path d="M15.5 5.5c1.5.3 2.5 1.6 2.5 3s-1 2.7-2.5 3" />
      <path d="M17.5 14.2c2 .5 3.5 2.3 3.5 4.8" />
    </svg>
  );
}

export function PackageIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <path d="M3.5 8.2 12 3.5l8.5 4.7v8.6L12 21.5l-8.5-4.7z" />
      <path d="M3.5 8.2 12 12.9l8.5-4.7" />
      <path d="M12 12.9v8.6" />
    </svg>
  );
}

export function SettingsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M4.9 4.9l1.55 1.55M17.55 17.55l1.55 1.55M3 12h2.2M18.8 12H21M4.9 19.1l1.55-1.55M17.55 6.45l1.55-1.55" />
    </svg>
  );
}

export function LogoutIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="animate-spin"
      {...props}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
