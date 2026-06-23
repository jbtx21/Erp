import { describe, expect, it } from "vitest";
import { IntegrationsError, IntegrationsService, LoggingSlackSender } from "./integrations.service.js";
import { InMemoryIntegrationsRepository } from "../../repositories/in-memory-integrations.repository.js";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }
function setup() {
  const repo = new InMemoryIntegrationsRepository();
  const slack = new LoggingSlackSender();
  return { svc: new IntegrationsService(repo, new MemAudit(), slack), repo, slack };
}

describe("IntegrationsService (Connector-Plattform)", () => {
  it("listet den Katalog mit Status; Geheimnisse maskiert", async () => {
    const { svc } = setup();
    const list = await svc.list();
    expect(list.length).toBeGreaterThanOrEqual(6);
    expect(list.find((c) => c.kind === "SLACK")?.enabled).toBe(false);
  });

  it("konfiguriert Slack und maskiert das Geheimnis in der Liste", async () => {
    const { svc } = setup();
    await svc.configure("SLACK", true, { webhookUrl: "https://hooks.slack.com/xxx" });
    const slack = (await svc.list()).find((c) => c.kind === "SLACK")!;
    expect(slack.enabled).toBe(true);
    expect(slack.configured).toBe(true);
    expect(slack.config.webhookUrl).toBe("••••••"); // maskiert
  });

  it("behält ein unverändertes (maskiertes) Geheimnis bei erneutem Speichern", async () => {
    const { svc, repo } = setup();
    await svc.configure("SLACK", true, { webhookUrl: "https://hooks.slack.com/real" });
    await svc.configure("SLACK", false, { webhookUrl: "••••••" }); // unverändert
    const cfg = JSON.parse((await repo.get("SLACK"))!.configJson!);
    expect(cfg.webhookUrl).toBe("https://hooks.slack.com/real");
  });

  it("verbietet das Konfigurieren von Worker-only-Connectoren", async () => {
    await expect(setup().svc.configure("WOOCOMMERCE", true, {})).rejects.toBeInstanceOf(IntegrationsError);
  });

  it("Slack-Test sendet eine Nachricht; ohne URL Fehler", async () => {
    const { svc, slack } = setup();
    await expect(svc.test("SLACK")).rejects.toBeInstanceOf(IntegrationsError); // keine URL
    await svc.configure("SLACK", true, { webhookUrl: "https://hooks.slack.com/x" });
    const r = await svc.test("SLACK");
    expect(r.ok).toBe(true);
    expect(slack.sent).toHaveLength(1);
  });
});
