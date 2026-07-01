// Unifarbener KPI-/UI-Icon-Satz (Strich-Icons, currentColor) — im Stil von nav-icons.tsx
// (24er-Viewbox, 1,75px, runde Kappen). Ersetzt Emoji-„Icons" in MetricCards & Co.:
// EIN Ton pro Icon (erbt die Kachel-Farbe), keine bunten Emoji-Pictogramme.
import type { JSX, ReactNode } from "react";

function Svg({ size = 20, children }: { size?: number; children: ReactNode }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {children}
    </svg>
  );
}

export type IconName =
  | "box" | "document" | "building" | "trending-up" | "list"
  | "alarm" | "triangle" | "check" | "calendar-x" | "flame" | "clock" | "truck";

const PATHS: Record<IconName, JSX.Element> = {
  box: (<>
    <path d="M12 3l8 4.5v9l-8 4.5l-8 -4.5v-9z" /><path d="M12 12l8 -4.5" /><path d="M12 12v9" /><path d="M12 12l-8 -4.5" />
  </>),
  document: (<>
    <path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
    <path d="M9 13h6" /><path d="M9 17h6" />
  </>),
  building: (<>
    <path d="M3 21h18" /><path d="M5 21v-14l8 -4v18" /><path d="M19 21v-10l-6 -4" />
    <path d="M9 9v.01" /><path d="M9 12v.01" /><path d="M9 15v.01" /><path d="M9 18v.01" />
  </>),
  "trending-up": (<>
    <path d="M3 17l6 -6l4 4l8 -8" /><path d="M14 7l7 0l0 7" />
  </>),
  list: (<>
    <path d="M9 6l11 0" /><path d="M9 12l11 0" /><path d="M9 18l11 0" />
    <path d="M5 6v.01" /><path d="M5 12v.01" /><path d="M5 18v.01" />
  </>),
  alarm: (<>
    <path d="M12 13m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M12 10l0 3l2 0" />
    <path d="M7 4l-2.75 2" /><path d="M17 4l2.75 2" />
  </>),
  triangle: (<>
    <path d="M12 9v4" /><path d="M12 16h.01" />
    <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" />
  </>),
  check: (<>
    <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M9 12l2 2l4 -4" />
  </>),
  "calendar-x": (<>
    <path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z" />
    <path d="M16 3v4" /><path d="M8 3v4" /><path d="M4 11h16" /><path d="M10 14l4 4" /><path d="M14 14l-4 4" />
  </>),
  flame: (<path d="M12 12c2 -2.96 0 -7 -1 -8c0 3.038 -1.773 4.741 -3 6c-1.226 1.26 -2 3.24 -2 5a6 6 0 1 0 12 0c0 -1.532 -1.056 -3.94 -2 -5c-1.786 3 -2.791 3 -4 2z" />),
  clock: (<>
    <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M12 7v5l3 3" />
  </>),
  truck: (<>
    <path d="M7 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M5 17h-2v-11a1 1 0 0 1 1 -1h9v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5" />
  </>),
};

/** Unifarbenes Strich-Icon (erbt die Farbe via currentColor). */
export function Icon({ name, size }: { name: IconName; size?: number }): JSX.Element {
  return <Svg size={size}>{PATHS[name]}</Svg>;
}
