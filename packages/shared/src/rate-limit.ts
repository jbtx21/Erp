// Schlanker Rate-Limiter (Fixed-Window) — IO-frei und zeit-injizierbar, daher testbar.
// Einsatz: Brute-Force-Schutz am Login/Passwort-Reset (Kap. 27/28). Pro Schlüssel
// (z. B. E-Mail oder IP) sind höchstens `max` Versuche je Zeitfenster erlaubt.

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Sekunden bis zum Zurücksetzen des Fensters (nur relevant, wenn blockiert). */
  retryAfterSec: number;
}

export class FixedWindowRateLimiter {
  private readonly hits = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** Zählt einen Versuch und meldet, ob er erlaubt ist. */
  check(key: string): RateLimitResult {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || t - entry.windowStart >= this.windowMs) {
      this.hits.set(key, { count: 1, windowStart: t });
      return { allowed: true, remaining: this.max - 1, retryAfterSec: 0 };
    }
    entry.count += 1;
    if (entry.count > this.max) {
      const retryAfterSec = Math.ceil((entry.windowStart + this.windowMs - t) / 1000);
      return { allowed: false, remaining: 0, retryAfterSec };
    }
    return { allowed: true, remaining: this.max - entry.count, retryAfterSec: 0 };
  }

  /** Erfolgreiche Aktion (z. B. gelungener Login) löscht den Zähler. */
  reset(key: string): void {
    this.hits.delete(key);
  }

  /** Entfernt abgelaufene Fenster (optional, gegen unbegrenztes Wachstum). */
  prune(): void {
    const t = this.now();
    for (const [key, entry] of this.hits) {
      if (t - entry.windowStart >= this.windowMs) this.hits.delete(key);
    }
  }
}
