// Matrixprodukt-Grundtabelle: Validierung, Trimming, GoBD-Audit (Before/After).

import { describe, expect, it } from "vitest";
import { MatrixService } from "./matrix.service.js";
import { InMemoryMatrixRepository } from "../../repositories/in-memory-matrix.repository.js";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";

function make() {
  const audit = new MemoryAuditSink();
  return { svc: new MatrixService(new InMemoryMatrixRepository(), audit), audit };
}

describe("MatrixService — Achswerte (Grundtabelle)", () => {
  it("legt einen Achswert getrimmt an und auditiert CREATE", async () => {
    const { svc, audit } = make();
    const { id } = await svc.createAxisValue({ axis: "FARBE", value: "  Navy  ", hex: " #001F3F " });
    const vals = await svc.listAxisValues("FARBE");
    expect(vals).toHaveLength(1);
    expect(vals[0]).toMatchObject({ id, value: "Navy", hex: "#001F3F", active: true });
    expect(audit.entries.at(-1)).toMatchObject({ entity: "AxisValue", action: "CREATE" });
  });

  it("lehnt leeren Wert ab", async () => {
    const { svc } = make();
    await expect(svc.createAxisValue({ axis: "GROESSE", value: "   " })).rejects.toThrow();
  });

  it("updatet einen Achswert mit Before/After-Audit und kann ihn deaktivieren", async () => {
    const { svc, audit } = make();
    const { id } = await svc.createAxisValue({ axis: "GROESSE", value: "M", sortOrder: 2 });
    await svc.updateAxisValue(id, { sortOrder: 5, active: false });
    const all = await svc.listAxisValues("GROESSE", true);
    expect(all[0]).toMatchObject({ sortOrder: 5, active: false });
    // ohne includeInactive ist der deaktivierte Wert nicht mehr sichtbar
    expect(await svc.listAxisValues("GROESSE")).toHaveLength(0);
    const last = audit.entries.at(-1)!;
    expect(last).toMatchObject({ entity: "AxisValue", action: "UPDATE" });
    expect(last.before).toMatchObject({ sortOrder: 2, active: true });
    expect(last.after).toMatchObject({ sortOrder: 5, active: false });
  });
});

describe("MatrixService — Größenläufe", () => {
  it("speichert einen Größenlauf, trimmt/filtert Werte und ist per Name idempotent (Upsert)", async () => {
    const { svc } = make();
    const first = await svc.saveSizeRun(" Standard ", [" S ", "M", "", "L"]);
    const second = await svc.saveSizeRun("Standard", ["S", "M", "L", "XL"]);
    expect(second.id).toBe(first.id);
    const runs = await svc.listSizeRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ name: "Standard", values: ["S", "M", "L", "XL"] });
  });

  it("lehnt einen leeren Größenlauf ab", async () => {
    const { svc } = make();
    await expect(svc.saveSizeRun("Leer", ["", "  "])).rejects.toThrow();
  });

  it("löscht einen Größenlauf", async () => {
    const { svc } = make();
    const { id } = await svc.saveSizeRun("Weg", ["S"]);
    await svc.deleteSizeRun(id);
    expect(await svc.listSizeRuns()).toHaveLength(0);
  });
});
