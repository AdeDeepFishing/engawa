"use client";

const KEY = "engawa.device";
const CONSENT_KEY = "engawa.consented";

/** Random per-browser identifier for rate limiting and "my submissions". No account. */
export function getDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing && /^[0-9a-f-]{36}$/.test(existing)) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function hasConsented(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setConsented(): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, "1");
  } catch {
    // ignore
  }
}
