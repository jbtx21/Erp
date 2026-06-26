// Lieferadressen je Firma (B3 / Xentral-Benchmark): Anlage, Standard-Logik, Löschschutz.

import { describe, expect, it } from "vitest";
import { CompanyAddressError, CompanyAddressService } from "./company-address.service.js";
import { InMemoryCompanyAddressRepository } from "../../repositories/in-memory-company-address.repository.js";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";

function make() {
  const repo = new InMemoryCompanyAddressRepository();
  return { repo, svc: new CompanyAddressService(repo, new MemoryAuditSink()) };
}

const addr = (label: string) => ({ label, street: "Weg 1", zip: "45000", city: "Essen" });

describe("CompanyAddressService", () => {
  it("macht die erste Adresse automatisch zur Standardadresse", async () => {
    const { svc } = make();
    const a = await svc.create("c1", addr("Lager"));
    const list = await svc.list("c1");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: a.id, label: "Lager", isDefault: true, country: "DE" });
  });

  it("hält genau eine Standardadresse je Firma", async () => {
    const { svc } = make();
    await svc.create("c1", addr("Lager"));
    const b = await svc.create("c1", addr("Filiale"));
    await svc.setDefault("c1", b.id);
    const list = await svc.list("c1");
    expect(list.filter((x) => x.isDefault).map((x) => x.id)).toEqual([b.id]);
  });

  it("lehnt unvollständige Adressen ab", async () => {
    const { svc } = make();
    await expect(svc.create("c1", { label: "", street: "Weg", zip: "1", city: "X" })).rejects.toBeInstanceOf(CompanyAddressError);
    await expect(svc.create("c1", { label: "Lager", street: "", zip: "", city: "" })).rejects.toBeInstanceOf(CompanyAddressError);
  });

  it("schützt fremde Adressen vor Bearbeitung/Löschung", async () => {
    const { svc } = make();
    const a = await svc.create("c1", addr("Lager"));
    await expect(svc.update(a.id, "c2", { city: "Bochum" })).rejects.toBeInstanceOf(CompanyAddressError);
    await expect(svc.delete(a.id, "c2")).rejects.toBeInstanceOf(CompanyAddressError);
  });

  it("verweigert die Löschung referenzierter Adressen", async () => {
    const { svc, repo } = make();
    const a = await svc.create("c1", addr("Lager"));
    repo.orderCounts.set(a.id, 2);
    await expect(svc.delete(a.id, "c1")).rejects.toBeInstanceOf(CompanyAddressError);
    await svc.create("c1", addr("Filiale")); // damit c1 nicht leer ist
    repo.orderCounts.set(a.id, 0);
    await svc.delete(a.id, "c1");
    expect((await svc.list("c1")).map((x) => x.label)).toEqual(["Filiale"]);
  });
});
