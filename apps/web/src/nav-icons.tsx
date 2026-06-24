// Schlanker Inline-SVG-Icon-Satz für die Modul-Navigation (keine zusätzliche
// Icon-Lib, kein Netzwerk-Install). Strich-Icons (currentColor, 1,75px) — rein
// funktionale Wegweiser je Sektion, kein Anfrageshop-Pictogram (erp-ui-design §5).
import type { JSX } from "react";

/** Gemeinsamer SVG-Rahmen: 24er-Viewbox, currentColor, runde Kappen. */
function Svg({ size = 18, children }: { size?: number; children: React.ReactNode }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {children}
    </svg>
  );
}

// Je Sektion ein Icon. Schlüssel = NAV-Gruppenname.
export type NavIconName =
  | "uebersicht" | "vertrieb" | "beschaffung" | "stammdaten" | "produktion"
  | "logistik" | "finanzen" | "system" | "einstellungen"
  | "crm" | "lager" | "hr";

const PATHS: Record<NavIconName, JSX.Element> = {
  uebersicht: (<>
    <rect x="4" y="4" width="6" height="8" rx="1" /><rect x="4" y="16" width="6" height="4" rx="1" />
    <rect x="14" y="12" width="6" height="8" rx="1" /><rect x="14" y="4" width="6" height="4" rx="1" />
  </>),
  vertrieb: (<>
    <path d="M6 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M15 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M17 17h-11v-14h-2" /><path d="M6 5l14 1l-1 7h-13" />
  </>),
  beschaffung: (<>
    <path d="M12 3l8 4.5v9l-8 4.5l-8 -4.5v-9z" /><path d="M12 12l8 -4.5" /><path d="M12 12v9" />
    <path d="M12 12l-8 -4.5" /><path d="M16 5.25l-8 4.5" />
  </>),
  stammdaten: (<>
    <path d="M4 6a8 3 0 1 0 16 0a8 3 0 1 0 -16 0" /><path d="M4 6v6a8 3 0 0 0 16 0v-6" />
    <path d="M4 12v6a8 3 0 0 0 16 0v-6" />
  </>),
  produktion: (<path d="M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8z" />),
  logistik: (<>
    <path d="M7 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M5 17h-2v-11a1 1 0 0 1 1 -1h9v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5" />
  </>),
  finanzen: (<>
    <path d="M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3" />
    <path d="M20 12v4h-4a2 2 0 0 1 0 -4z" /><path d="M5 8v8a2 2 0 0 0 2 2h11a1 1 0 0 0 1 -1v-1" />
  </>),
  system: (<>
    <rect x="3" y="4" width="18" height="8" rx="2" /><rect x="3" y="12" width="18" height="8" rx="2" />
    <path d="M7 8h.01" /><path d="M7 16h.01" />
  </>),
  einstellungen: (<>
    <path d="M10.3 4.3c.4 -1.7 2.9 -1.7 3.3 0a1.7 1.7 0 0 0 2.6 1.1c1.5 -.9 3.3 .8 2.4 2.4a1.7 1.7 0 0 0 1 2.5c1.8 .4 1.8 2.9 0 3.4a1.7 1.7 0 0 0 -1 2.5c.9 1.5 -.9 3.3 -2.4 2.4a1.7 1.7 0 0 0 -2.6 1c-.4 1.8 -2.9 1.8 -3.3 0a1.7 1.7 0 0 0 -2.6 -1c-1.5 .9 -3.3 -.9 -2.4 -2.4a1.7 1.7 0 0 0 -1 -2.5c-1.8 -.5 -1.8 -3 0 -3.4a1.7 1.7 0 0 0 1 -2.5c-.9 -1.6 .9 -3.3 2.4 -2.4c1 .6 2.3 .1 2.6 -1z" />
    <path d="M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
  </>),
  crm: (<>
    <path d="M9 7a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
  </>),
  lager: (<>
    <path d="M3 21v-13l9 -4l9 4v13" /><path d="M13 13h4v8h-10v-6h6" /><path d="M13 21v-9a1 1 0 0 0 -1 -1h-2a1 1 0 0 0 -1 1v3" />
  </>),
  hr: (<>
    <path d="M8 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
  </>),
};

/** Sektions-Icon nach Gruppenname. */
export function NavIcon({ name, size }: { name: NavIconName; size?: number }): JSX.Element {
  return <Svg size={size}>{PATHS[name]}</Svg>;
}

/** Chevron für aufklappbare Gruppen (zeigt nach unten, rotiert bei zu). */
export function Chevron({ open, size = 16 }: { open: boolean; size?: number }): JSX.Element {
  return (
    <span style={{ display: "inline-flex", transition: "transform 150ms ease", transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}>
      <Svg size={size}><path d="M6 9l6 6l6 -6" /></Svg>
    </span>
  );
}

/** Sidebar ein-/ausklappen (Panel-Toggle in der Kopfleiste). */
export function SidebarToggleIcon({ size = 18 }: { size?: number }): JSX.Element {
  return <Svg size={size}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 4v16" /></Svg>;
}
