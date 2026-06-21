// Passwort-Hashing (Argon2id) über @node-rs/argon2 (prebuilt, kein node-gyp).
import { hash, verify } from "@node-rs/argon2";

export interface Hasher {
  hash(plain: string): Promise<string>;
  verify(hashStr: string, plain: string): Promise<boolean>;
}

export class Argon2Hasher implements Hasher {
  async hash(plain: string): Promise<string> {
    return hash(plain);
  }
  async verify(hashStr: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashStr, plain);
    } catch {
      return false;
    }
  }
}
