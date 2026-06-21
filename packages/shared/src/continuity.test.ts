import { describe, expect, it } from "vitest";
import {
  buildOfflineBundle,
  offlineBundleCsv,
  type OfflineBundleOrder,
} from "./continuity.js";

const complete: OfflineBundleOrder = {
  orderNumber: "AB-2026-0001",
  articleName: "Poloshirt",
  farbe: "Navy",
  groesse: "L",
  qty: 50,
  logoLabel: "Logo v3",
};

describe("buildOfflineBundle (B17 / Modus A)", () => {
  it("nimmt vollständige Aufträge als offline-tauglich auf", () => {
    const b = buildOfflineBundle([complete], new Date(Date.UTC(2026, 5, 21)));
    expect(b.complete).toBe(true);
    expect(b.incomplete).toEqual([]);
    expect(b.items[0]).toEqual({ orderNumber: "AB-2026-0001", complete: true, missing: [] });
  });

  it("markiert Aufträge mit fehlenden Basis-Pflichtfeldern", () => {
    const broken: OfflineBundleOrder = { ...complete, orderNumber: "AB-2026-0002", logoLabel: "", qty: 0 };
    const b = buildOfflineBundle([complete, broken]);
    expect(b.complete).toBe(false);
    expect(b.incomplete).toEqual(["AB-2026-0002"]);
    expect(b.items[1]?.missing).toEqual(["Menge", "Logo"]);
  });

  it("ist robust ohne offene Aufträge", () => {
    expect(buildOfflineBundle([]).complete).toBe(true);
  });
});

describe("offlineBundleCsv", () => {
  it("serialisiert Kopf + Zeilen", () => {
    const csv = offlineBundleCsv(buildOfflineBundle([complete]));
    expect(csv.split("\n")[0]).toBe("Auftrag;Vollstaendig;Fehlend");
    expect(csv).toContain("AB-2026-0001;ja;");
  });
});
