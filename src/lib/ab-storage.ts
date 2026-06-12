/**
 * A/B Bucket Storage Adapter
 *
 * Einheitliche read/write/remove-API über zwei Backends:
 *
 *   - `localStorage` (Default, bisheriges Verhalten)
 *   - `cookie`       (First-Party-Cookie, 30-Tage-Expiry, Path=/, SameSite=Lax,
 *                     `Secure` wenn https) — überlebt LocalStorage-Clears und
 *                     teilt den Bucket über alle Subdomains der eTLD+1.
 *
 * Backend-Wahl (von höchster zu niedrigster Priorität):
 *   1. `?ab_storage=cookie` / `?ab_storage=local` in der URL (sticky in
 *      sessionStorage, damit Reloads konsistent bleiben).
 *   2. `localStorage["ab_storage_backend"]` = "cookie" | "local".
 *   3. `import.meta.env.VITE_AB_STORAGE_BACKEND` = "cookie" | "local".
 *   4. Fallback: "local".
 *
 * Wichtig:
 *  - Beide Backends nutzen denselben Storage-Key. Beim Lesen wird das aktive
 *    Backend bevorzugt; ist es leer, wird einmalig vom anderen Backend
 *    übernommen, damit ein Backend-Wechsel den Bucket nicht resettet.
 *  - Cookies werden nur für JSON-Schema-Werte verwendet (nie für Plain-Legacy).
 *    Plain-Legacy bleibt allein in localStorage und wird vom Migrator
 *    überschrieben — Cookie ist Post-Migrations-Pfad.
 */

export type AbStorageBackend = "local" | "cookie";

const BACKEND_OVERRIDE_KEY = "ab_storage_backend";
const COOKIE_MAX_AGE_DAYS = 30;
const COOKIE_MAX_AGE_SECONDS = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
const COOKIE_PREFIX = "ab_";

const isBrowser = () => typeof window !== "undefined";

/** Aktives Backend für die laufende Session. SSR-safe. */
export function getAbStorageBackend(): AbStorageBackend {
  if (!isBrowser()) return "local";
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("ab_storage");
    if (fromUrl === "cookie" || fromUrl === "local") {
      window.sessionStorage.setItem(BACKEND_OVERRIDE_KEY, fromUrl);
      return fromUrl;
    }
    const sticky = window.sessionStorage.getItem(BACKEND_OVERRIDE_KEY);
    if (sticky === "cookie" || sticky === "local") return sticky;
    const fromLs = window.localStorage.getItem(BACKEND_OVERRIDE_KEY);
    if (fromLs === "cookie" || fromLs === "local") return fromLs;
  } catch {
    /* Storage blockiert → env / default */
  }
  const fromEnv = (import.meta as { env?: Record<string, string | undefined> })?.env
    ?.VITE_AB_STORAGE_BACKEND;
  if (fromEnv === "cookie" || fromEnv === "local") return fromEnv;
  return "local";
}

/** Persistente Wahl des Backends (überlebt Tabs). Re-Roll-frei. */
export function setAbStorageBackend(backend: AbStorageBackend): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(BACKEND_OVERRIDE_KEY, backend);
    window.sessionStorage.setItem(BACKEND_OVERRIDE_KEY, backend);
  } catch {
    /* ignore */
  }
}

// ───────────────────────── Cookie helpers ─────────────────────────

function cookieName(storageKey: string): string {
  // Cookie-safe: Buchstaben/Zahlen/Underscore. Storage-Keys wie "ab:playbook…"
  // → "ab_ab_playbook…" (Prefix garantiert eindeutige Cookie-Namespaces).
  const safe = storageKey.replace(/[^a-zA-Z0-9_]/g, "_");
  return `${COOKIE_PREFIX}${safe}`;
}

function readCookie(name: string): string | null {
  if (!isBrowser() || typeof document === "undefined") return null;
  const target = `${name}=`;
  const parts = document.cookie ? document.cookie.split("; ") : [];
  for (const part of parts) {
    if (part.startsWith(target)) {
      try {
        return decodeURIComponent(part.slice(target.length));
      } catch {
        return part.slice(target.length);
      }
    }
  }
  return null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (!isBrowser() || typeof document === "undefined") return;
  const secure =
    typeof window.location !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`;
}

function deleteCookie(name: string): void {
  if (!isBrowser() || typeof document === "undefined") return;
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
}

// ───────────────────────── Adapter API ─────────────────────────

export interface AbStorageAdapter {
  backend: AbStorageBackend;
  read(storageKey: string): string | null;
  write(storageKey: string, value: string): void;
  remove(storageKey: string): void;
}

/**
 * Liefert den aktiven Adapter. Beim Lesen wird automatisch vom *anderen*
 * Backend übernommen, falls das aktive leer ist (One-Way-Mirror), damit ein
 * Wechsel local↔cookie keinen Re-Roll auslöst.
 */
export function getAbStorage(): AbStorageAdapter {
  const backend = getAbStorageBackend();

  if (backend === "cookie") {
    return {
      backend,
      read(storageKey) {
        if (!isBrowser()) return null;
        const cookieVal = readCookie(cookieName(storageKey));
        if (cookieVal != null) return cookieVal;
        // Migration aus localStorage → Cookie (einmalig, ohne TTL-Reset).
        try {
          const lsVal = window.localStorage.getItem(storageKey);
          if (lsVal && lsVal.startsWith("{")) {
            writeCookie(cookieName(storageKey), lsVal, COOKIE_MAX_AGE_SECONDS);
            return lsVal;
          }
        } catch {
          /* ignore */
        }
        return null;
      },
      write(storageKey, value) {
        writeCookie(cookieName(storageKey), value, COOKIE_MAX_AGE_SECONDS);
        // Spiegel auch in localStorage, damit ein Backend-Switch zurück
        // sofort denselben Bucket hat.
        try {
          window.localStorage.setItem(storageKey, value);
        } catch {
          /* ignore */
        }
      },
      remove(storageKey) {
        deleteCookie(cookieName(storageKey));
        try {
          window.localStorage.removeItem(storageKey);
        } catch {
          /* ignore */
        }
      },
    };
  }

  return {
    backend,
    read(storageKey) {
      if (!isBrowser()) return null;
      try {
        const lsVal = window.localStorage.getItem(storageKey);
        if (lsVal != null) return lsVal;
      } catch {
        /* ignore */
      }
      // Fallback: Cookie aus früherem Cookie-Modus → adoptieren.
      const cookieVal = readCookie(cookieName(storageKey));
      if (cookieVal != null) {
        try {
          window.localStorage.setItem(storageKey, cookieVal);
        } catch {
          /* ignore */
        }
        return cookieVal;
      }
      return null;
    },
    write(storageKey, value) {
      try {
        window.localStorage.setItem(storageKey, value);
      } catch {
        /* ignore */
      }
    },
    remove(storageKey) {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    },
  };
}
