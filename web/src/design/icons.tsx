import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number; label?: string };

function Svg({ size = 20, label, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconDashboard = (p: P) => (
  <Svg {...p}><rect x="3.5" y="3.5" width="7" height="9" rx="1.6" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.6" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.6" /><rect x="3.5" y="15.5" width="7" height="5" rx="1.6" /></Svg>
);
export const IconNetwork = (p: P) => (
  <Svg {...p}><circle cx="12" cy="5" r="2" /><circle cx="5" cy="18.5" r="2" /><circle cx="19" cy="18.5" r="2" /><path d="M12 7v4.5M12 11.5l-5.6 5.4M12 11.5l5.6 5.4" /></Svg>
);
export const IconHistory = (p: P) => (
  <Svg {...p}><path d="M3.8 12a8.2 8.2 0 1 0 2.4-5.8" /><path d="M3.5 4v3.6h3.6" /><path d="M12 7.8V12l2.9 1.9" /></Svg>
);
export const IconDiagnostics = (p: P) => (
  <Svg {...p}><path d="M3 12h3.6l2.2-5.5 4.2 11 2.4-5.5H21" /></Svg>
);
export const IconSettings = (p: P) => (
  <Svg {...p}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Svg>
);
export const IconBolt = (p: P) => (
  <Svg {...p}><path d="M13.2 2.8 5.5 13.4h5.6l-1 7.8 7.7-10.6h-5.6l1-7.8Z" /></Svg>
);
export const IconWifi = ({ bars = 3, ...p }: P & { bars?: number }) => (
  <Svg {...p}>
    <path d="M2.8 9a13.2 13.2 0 0 1 18.4 0" opacity={bars >= 3 ? 1 : 0.25} />
    <path d="M5.9 12.3a8.8 8.8 0 0 1 12.2 0" opacity={bars >= 2 ? 1 : 0.25} />
    <path d="M9 15.6a4.4 4.4 0 0 1 6 0" opacity={bars >= 1 ? 1 : 0.25} />
    <circle cx="12" cy="19" r="0.9" fill="currentColor" />
  </Svg>
);
export const IconRouter = (p: P) => (
  <Svg {...p}><rect x="3" y="13" width="18" height="6.5" rx="2" /><path d="M7 13V6M17 13V6" /><path d="M7 16.3h.01M10 16.3h.01" /></Svg>
);
export const IconLaptop = (p: P) => (
  <Svg {...p}><rect x="4.5" y="5" width="15" height="10" rx="1.5" /><path d="M2.5 18.5h19" /></Svg>
);
export const IconGlobe = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5S9.6 5.9 12 3.5Z" /></Svg>
);
export const IconRefresh = (p: P) => (
  <Svg {...p}><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4.5v4h-4" /></Svg>
);
export const IconCopy = (p: P) => (
  <Svg {...p}><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>
);
export const IconWarning = (p: P) => (
  <Svg {...p}><path d="M12 4 2.8 19.5h18.4L12 4Z" /><path d="M12 10v4.5M12 17h.01" /></Svg>
);
export const IconError = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="m9 9 6 6M15 9l-6 6" /></Svg>
);
export const IconChevron = (p: P) => (
  <Svg {...p}><path d="m9.5 6 6 6-6 6" /></Svg>
);
export const IconArrowRight = (p: P) => (
  <Svg {...p}><path d="M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5" /></Svg>
);
export const IconLock = (p: P) => (
  <Svg {...p}><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></Svg>
);
export const IconLocation = (p: P) => (
  <Svg {...p}><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></Svg>
);
export const IconInfo = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8h.01" /></Svg>
);
export const IconExternal = (p: P) => (
  <Svg {...p}><path d="M13.5 4.5h6v6M19.5 4.5 11 13M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></Svg>
);
export const IconChip = (p: P) => (
  <Svg {...p}><rect x="6" y="6" width="12" height="12" rx="2.5" /><path d="M9.5 2.5v3.5M14.5 2.5v3.5M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5" /></Svg>
);

/** Logo mark: isometric hexagonal cube with the right face shifted outward. Original artwork. */
export function LogoMark({ size = 32, draw = false, id = 'lm' }: { size?: number; draw?: boolean; id?: string }) {
  const stroke = `url(#${id}-g)`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className={draw ? 'logo-draw' : undefined}>
      <defs>
        <linearGradient id={`${id}-g`} x1="4" y1="3" x2="28" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7BE6FF" />
          <stop offset="1" stopColor="#2F6BFF" />
        </linearGradient>
        <linearGradient id={`${id}-f`} x1="18" y1="10" x2="28" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7BE6FF" stopOpacity=".55" />
          <stop offset="1" stopColor="#2F6BFF" stopOpacity=".25" />
        </linearGradient>
      </defs>
      {/* top face */}
      <path d="M16 3.5 26 9.2 16 15 6 9.2 16 3.5Z" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" pathLength={1} />
      {/* left face */}
      <path d="M6 9.2V20.8L16 26.5V15L6 9.2Z" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" pathLength={1} />
      {/* shifted right face */}
      <path d="M18.6 13.4 28.4 7.8V19.4L18.6 25V13.4Z" fill={`url(#${id}-f)`} stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" pathLength={1} />
    </svg>
  );
}
