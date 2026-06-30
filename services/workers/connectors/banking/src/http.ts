// Gemeinsame HTTP-Helfer für die REST-Adapter: JSON-Request mit Bearer-Token,
// Status-Prüfung und exponentielles Retry für transiente Fehler (5xx/429).

import { HttpError, isTransient, type FetchLike } from "./types.js";

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Anzahl Wiederholungen bei transienten Fehlern (Default 3). */
  retries?: number;
}

/** Führt einen HTTP-Request aus, wirft `HttpError` bei !ok, retried transiente Fehler. */
export async function httpRequest(
  fetchImpl: FetchLike,
  url: string,
  opts: RequestOptions = {},
  sleep: (ms: number) => Promise<void> = defaultSleep
): Promise<{ status: number; text: string }> {
  const retries = opts.retries ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, { method: opts.method ?? "GET", headers: opts.headers, body: opts.body });
      if (res.ok) return { status: res.status, text: await res.text() };
      const body = await res.text().catch(() => "");
      const err = new HttpError(res.status, `HTTP ${res.status} ${url}: ${body.slice(0, 200)}`);
      if (!isTransient(res.status) || attempt === retries) throw err;
      lastErr = err;
    } catch (e) {
      if (e instanceof HttpError && !isTransient(e.status)) throw e;
      lastErr = e;
      if (attempt === retries) throw e;
    }
    await sleep(2 ** attempt * 250); // 250ms, 500ms, 1s …
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** JSON-GET mit Bearer-Token → geparstes JSON. */
export async function getJson(fetchImpl: FetchLike, url: string, token: string): Promise<unknown> {
  const { text } = await httpRequest(fetchImpl, url, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  return text ? JSON.parse(text) : null;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
