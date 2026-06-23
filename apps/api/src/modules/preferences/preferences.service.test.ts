import { describe, expect, it } from "vitest";
import { PreferencesService } from "./preferences.service.js";
import { InMemoryUserPreferenceRepository } from "../../repositories/in-memory-user-preference.repository.js";

function setup(): PreferencesService {
  return new PreferencesService(new InMemoryUserPreferenceRepository());
}

describe("PreferencesService", () => {
  it("liefert null, wenn nichts gespeichert ist", async () => {
    const svc = setup();
    expect(await svc.get("u1", "home.shortcuts.v1")).toBeNull();
  });

  it("speichert und liest einen strukturierten Wert (Roundtrip)", async () => {
    const svc = setup();
    const layout = { order: ["a", "b", "c"], hidden: ["b"] };
    await svc.set("u1", "home.shortcuts.v1", layout);
    expect(await svc.get("u1", "home.shortcuts.v1")).toEqual(layout);
  });

  it("trennt Werte je Nutzer und je Schlüssel", async () => {
    const svc = setup();
    await svc.set("u1", "home.shortcuts.v1", { order: ["x"] });
    await svc.set("u2", "home.shortcuts.v1", { order: ["y"] });
    expect(await svc.get("u1", "home.shortcuts.v1")).toEqual({ order: ["x"] });
    expect(await svc.get("u2", "home.shortcuts.v1")).toEqual({ order: ["y"] });
    expect(await svc.get("u1", "andere.einstellung")).toBeNull();
  });

  it("überschreibt einen bestehenden Wert", async () => {
    const svc = setup();
    await svc.set("u1", "k", { v: 1 });
    await svc.set("u1", "k", { v: 2 });
    expect(await svc.get("u1", "k")).toEqual({ v: 2 });
  });
});
