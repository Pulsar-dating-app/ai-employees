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

// The Scheduling area's tab and the Appointments page header (K4/K5).
export function CalendarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.75h17" />
      <path d="M8.25 3.5v3M15.75 3.5v3" />
    </svg>
  );
}

// The Appointments screen's view switch: the calendar button flips back to
// the list, so it needs the list's own mark (K4).
export function ListIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <path d="M9 6.5h11.5M9 12h11.5M9 17.5h11.5" />
      <path d="M4.25 6.5h.01M4.25 12h.01M4.25 17.5h.01" />
    </svg>
  );
}

// Month navigation on the same screen's calendar view.
export function ChevronLeftIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <path d="m14.5 5-7 7 7 7" />
    </svg>
  );
}

export function ChevronRightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <path d="m9.5 5 7 7-7 7" />
    </svg>
  );
}

// Services are "products, but the thing being sold is time" (H1's own
// framing) — hence a clock where the catalog gets a package.
export function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.4V12l3.1 1.9" />
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

export function LockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2" />
      <path d="M8 10.5V7a4 4 0 018 0v3.5" />
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

export function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function BadgeCheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function ArrowRightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function LinkIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function BarChartIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <path d="M4 20V10M10 20V4M16 20v-7M4 20h16" />
    </svg>
  );
}

export function ChatIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <path d="M20 15a3 3 0 0 1-3 3H8l-4 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z" />
    </svg>
  );
}

export function LightbulbIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.3 1 2.5h6c0-1.2.3-1.8 1-2.5A6 6 0 0 0 12 3Z" />
    </svg>
  );
}

export function TargetIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.5" fill="currentColor" />
    </svg>
  );
}

export function CartIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <circle cx="9" cy="20" r="1.25" />
      <circle cx="17" cy="20" r="1.25" />
      <path d="M3 4h2l2.4 12.2a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.8L21 8H6" />
    </svg>
  );
}

export function ActivityIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <path d="M3 12h4l3 8 4-16 3 8h4" />
    </svg>
  );
}

export function WhatsAppIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.16c-.24.68-1.42 1.32-1.95 1.36-.5.05-.97.24-3.27-.68-2.77-1.09-4.53-3.92-4.67-4.11-.14-.19-1.12-1.49-1.12-2.84 0-1.35.71-2.02.96-2.29.24-.27.53-.34.71-.34.18 0 .36 0 .51.01.16.01.39-.06.6.46.24.58.81 2 .88 2.14.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.56.16.27.72 1.18 1.54 1.92 1.06.94 1.95 1.24 2.22 1.38.27.14.43.12.59-.07.16-.19.68-.79.86-1.06.18-.27.36-.22.6-.13.24.09 1.55.73 1.81.86.27.14.44.2.51.31.07.12.07.68-.17 1.36Z" />
    </svg>
  );
}

export function InstagramIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CopyIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
      <path d="M15.5 8.5V6a2 2 0 0 0-2-2H5.5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2.5" />
    </svg>
  );
}

export function SendIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M3.4 20.6 21 12 3.4 3.4l.01 6.36L16 12l-12.59 2.24z" />
    </svg>
  );
}

// The Customize screen's two launcher-appearance choices.
export function VideoIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <rect x="3" y="6" width="13" height="12" rx="2.5" />
      <path d="m16 10.5 4.3-2.6a.7.7 0 0 1 1.05.6v6.9a.7.7 0 0 1-1.05.61L16 13.5" />
    </svg>
  );
}

export function ImageIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.75" />
      <path d="m5 18 5.5-5.5a2 2 0 0 1 2.8 0L19 18" />
    </svg>
  );
}

// The Share & Embed dialog's two sections.
export function CodeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <path d="m8.5 8-4 4 4 4" />
      <path d="m15.5 8 4 4-4 4" />
    </svg>
  );
}

export function InfoIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...NAV_ICON_PROPS} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <path d="M12 8v.01" />
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
