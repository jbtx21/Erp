// Objektspeicher-Port für das GoBD-Belegarchiv (Kap. 10). Write-once/WORM:
// inhaltsadressiert (Schlüssel = SHA-256), nie überschreibend. Eine lokale,
// dateibasierte Implementierung (Read-only-Dateien) als WORM auf App-Ebene; in
// Produktion tritt ein S3-Object-Lock-Adapter an deren Stelle (gleiche Schnittstelle).

import { constants as fsc } from "node:fs";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256Hex } from "@texma/shared";

export interface ObjectStore {
  /** Legt Bytes unter `key` ab. Existiert der Schlüssel bereits, MUSS der Inhalt gleich sein. */
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  exists(key: string): Promise<boolean>;
}

/** Dateibasierter WORM-Speicher: Schlüssel = SHA-256 → identischer Inhalt = identische Datei. */
export class FsWormObjectStore implements ObjectStore {
  constructor(private readonly root: string) {}

  private path(key: string): string {
    // Zwei-Ebenen-Fan-out (ab/cd…) gegen zu große Verzeichnisse.
    return join(this.root, key.slice(0, 2), key.slice(2, 4), key);
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const p = this.path(key);
    if (await this.exists(key)) {
      // Bereits vorhanden: Inhalt muss identisch sein (Inhalts-Adressierung garantiert das).
      const existing = await readFile(p);
      if (sha256Hex(existing) !== key) {
        throw new Error(`WORM-Verstoß: ${key} ist belegt und der Inhalt weicht ab.`);
      }
      return; // idempotent
    }
    await mkdir(join(this.root, key.slice(0, 2), key.slice(2, 4)), { recursive: true });
    await writeFile(p, data, { flag: "wx" });
    await chmod(p, 0o440); // read-only → unveränderbar (WORM auf Dateisystem-Ebene)
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return await readFile(this.path(key));
    } catch {
      return null;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.path(key), fsc.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}

/** In-Memory-WORM-Speicher für Tests. */
export class InMemoryObjectStore implements ObjectStore {
  private readonly map = new Map<string, Uint8Array>();
  async put(key: string, data: Uint8Array): Promise<void> {
    const existing = this.map.get(key);
    if (existing && sha256Hex(existing) !== sha256Hex(data)) {
      throw new Error(`WORM-Verstoß: ${key} ist belegt.`);
    }
    if (!existing) this.map.set(key, data);
  }
  async get(key: string): Promise<Uint8Array | null> {
    return this.map.get(key) ?? null;
  }
  async exists(key: string): Promise<boolean> {
    return this.map.has(key);
  }
}
