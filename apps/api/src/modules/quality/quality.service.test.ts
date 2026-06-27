import { describe, expect, it } from "vitest";
import { QualityError, QualityService } from "./quality.service.js";
import { InMemoryQualityRepository } from "../../repositories/in-memory-quality.repository.js";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }

function setup(): { svc: QualityService; repo: InMemoryQualityRepository } {
  const repo = new InMemoryQualityRepository();
  repo.seed("order_1");
  return { svc: new QualityService(repo, new MemAudit()), repo };
}

describe("QualityService — QS-Gate vor Versand (Kap. 20)", () => {
  it("ist anfangs OFFEN", async () => {
    const { svc } = setup();
    expect((await svc.get("order_1")).status).toBe("OFFEN");
  });

  it("besteht erst, wenn Stückzahl + externe Veredelung + Foto kontrolliert sind", async () => {
    const { svc } = setup();
    await svc.check("order_1", { stueckzahlOk: true });
    expect((await svc.get("order_1")).status).toBe("OFFEN");
    await svc.check("order_1", { veredelungOk: true });
    expect((await svc.get("order_1")).status).toBe("OFFEN");
    const qc = await svc.check("order_1", { fotoOk: true });
    expect(qc.status).toBe("BESTANDEN");
    expect(qc.geprueftAm).not.toBeNull();
  });

  it("schließt das Gate wieder, wenn ein Prüfpunkt zurückgenommen wird", async () => {
    const { svc } = setup();
    await svc.check("order_1", { stueckzahlOk: true, veredelungOk: true, fotoOk: true });
    expect((await svc.get("order_1")).status).toBe("BESTANDEN");
    const qc = await svc.check("order_1", { veredelungOk: false });
    expect(qc.status).toBe("OFFEN");
    expect(qc.geprueftAm).toBeNull();
  });

  it("wirft bei unbekanntem Auftrag", async () => {
    const { svc } = setup();
    await expect(svc.check("nope", { fotoOk: true })).rejects.toBeInstanceOf(QualityError);
  });
});
