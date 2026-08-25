export type ClientRuntimeContext = {
  timeZone: string;
  locale: string;
  country?: string;
  countryCode?: string;
};

const CACHE_KEY = "uncgpt-runtime-context-v1";
const COUNTRY_ENDPOINT = "https://wtfismyip.com/json";

function browserDefaults(): ClientRuntimeContext {
  return {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    locale: navigator.language || "en-US",
  };
}

function safeCountry(value: unknown) {
  const country = String(value || "").trim().replace(/[^A-Za-z .'-]/g, "").slice(0, 80);
  return country || undefined;
}

function safeCountryCode(value: unknown) {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : undefined;
}

/**
 * Returns device-local context plus an optional country lookup. The wtfismyip
 * response is reduced in the browser before it reaches uncgpt: raw IP, host,
 * ISP, city, and other fields are never stored or sent to the chat API.
 */
export async function getClientRuntimeContext(): Promise<ClientRuntimeContext> {
  const defaults = browserDefaults();

  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as ClientRuntimeContext;
      return {
        ...defaults,
        country: safeCountry(parsed.country),
        countryCode: safeCountryCode(parsed.countryCode),
      };
    }
  } catch {
    // Context enrichment is optional and must never interrupt chat.
  }

  try {
    const response = await fetch(COUNTRY_ENDPOINT, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) return defaults;
    const data = await response.json();
    const context: ClientRuntimeContext = {
      ...defaults,
      country: safeCountry(data?.YourFuckingCountry),
      countryCode: safeCountryCode(data?.YourFuckingCountryCode),
    };
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({
        country: context.country,
        countryCode: context.countryCode,
      }));
    } catch {}
    return context;
  } catch {
    return defaults;
  }
}
