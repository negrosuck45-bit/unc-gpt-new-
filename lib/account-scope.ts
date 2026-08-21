const initialBrowserScope = typeof window !== "undefined" ? (window as any).__UNCGPT_ACCOUNT_SCOPE__ : undefined;
let activeAccountScope = normalizeScope(initialBrowserScope);



function normalizeScope(scope: string | null | undefined) {
  return String(scope || "guest").trim().replace(/[^a-zA-Z0-9._:-]/g, "_").slice(0, 160) || "guest";
}

export function setActiveAccountScope(scope: string | null | undefined) {
  activeAccountScope = normalizeScope(scope);
}

export function getActiveAccountScope() {
  return activeAccountScope;
}

export function accountStorageKey(baseKey: string) {
  return `${baseKey}:${activeAccountScope}`;
}

export function dispatchAccountScopeChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("uncgpt-account-scope-changed", { detail: activeAccountScope }));
  }
}

export function isGuestAccountScope() {
  return activeAccountScope === "guest";
}

export function claimLegacyStorage(baseKey: string, scopedKey: string) {
  if (typeof window === "undefined" || activeAccountScope === "guest") return null;
  try {
    const claimKey = `${baseKey}:legacy-claimed`;
    if (window.localStorage.getItem(claimKey)) return null;
    const legacy = window.localStorage.getItem(baseKey);
    if (!legacy) return null;
    window.localStorage.setItem(scopedKey, legacy);
    window.localStorage.setItem(claimKey, activeAccountScope);
    return legacy;
  } catch {
    return null;
  }
}

export function scopedStorage(baseKey: string): Storage {
  return {
    get length() { return typeof window === "undefined" ? 0 : window.localStorage.length; },
    clear() { if (typeof window !== "undefined") window.localStorage.clear(); },
    getItem(key: string) {
      if (typeof window === "undefined") return null;
      const scopedKey = accountStorageKey(key || baseKey);
      const current = window.localStorage.getItem(scopedKey);
      return current ?? claimLegacyStorage(key || baseKey, scopedKey);
    },
    key(index: number) { return typeof window === "undefined" ? null : window.localStorage.key(index); },
    removeItem(key: string) { if (typeof window !== "undefined") window.localStorage.removeItem(accountStorageKey(key || baseKey)); },
    setItem(key: string, value: string) { if (typeof window !== "undefined") window.localStorage.setItem(accountStorageKey(key || baseKey), value); },
  };
}
