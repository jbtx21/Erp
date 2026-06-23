import { describe, expect, it } from "vitest";
import { CONNECTOR_CATALOG, connectorDef } from "./connectors.js";

describe("Connector-Katalog", () => {
  it("enthält die Kern-Connectoren mit Kategorie + Feldern", () => {
    const kinds = CONNECTOR_CATALOG.map((c) => c.kind);
    for (const k of ["WOOCOMMERCE", "BREVO", "HUBSPOT", "SLACK"]) expect(kinds).toContain(k);
    expect(connectorDef("SLACK")?.fields.some((f) => f.secret)).toBe(true);
  });
  it("portalConfigurable trennt Selbstbedienung von Worker-Only", () => {
    expect(connectorDef("BREVO")?.portalConfigurable).toBe(true);
    expect(connectorDef("WOOCOMMERCE")?.portalConfigurable).toBe(false);
  });
});
