// Persönliche UI-Einstellungen je Nutzer (Key-Value, Wert = beliebiges JSON).
// Trägt z. B. das Home-Workspace-Layout, damit es geräteübergreifend gleich ist.
// Bewusst schlank (keine GoBD-Relevanz → kein Audit): nur lesen/schreiben des eigenen Werts.

export interface UserPreferenceRepository {
  get(userId: string, key: string): Promise<string | null>;
  set(userId: string, key: string, value: string): Promise<void>;
}

export class PreferencesService {
  constructor(private readonly repo: UserPreferenceRepository) {}

  /** Liefert den geparsten Wert oder null, wenn nichts (oder Müll) gespeichert ist. */
  async get(userId: string, key: string): Promise<unknown> {
    const raw = await this.repo.get(userId, key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /** Speichert den Wert als JSON-String unter (userId, key). */
  async set(userId: string, key: string, value: unknown): Promise<void> {
    await this.repo.set(userId, key, JSON.stringify(value));
  }
}
