/** Optional, consent-gated GA4. Never call this from a render/movement loop. */
export type AnalyticsConsent = "unknown" | "granted" | "denied";
type Mode = "solo" | "multiplayer";
export type AnalyticsEventMap = {
  room_create_attempt: { mode: "multiplayer" };
  room_join_attempt: { mode: "multiplayer"; method: "code" | "list" };
  room_entered: { mode: "multiplayer"; entry: "create" | "join"; player_count: number };
  room_join_failed: { mode: "multiplayer"; reason: "connection" | "rejected" };
  match_started: { mode: Mode; player_count: number };
  match_completed: { mode: Mode; duration_seconds: number; outcome: "wardens" | "impostor" | "unknown" };
  match_left: { mode: Mode; duration_seconds: number };
  rematch_selected: { mode: Mode };
};

export const ANALYTICS_CONSENT_KEY = "moonwarden.analytics-consent.v1";
const CONSENT_LIFETIME = 180 * 24 * 60 * 60 * 1000;
const SCRIPT_ID = "moonwarden-google-analytics";
const DENIED = {
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
};
type Gtag = (...args: unknown[]) => void;
type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: Gtag;
  [key: `ga-disable-${string}`]: boolean | undefined;
};

/** Explicit allowlist: arbitrary text, IDs, names, chat and URLs cannot pass. */
export function sanitizeAnalyticsEvent(name: string, input: unknown): Record<string, string | number> | null {
  if (!input || typeof input !== "object") return null;
  const data = input as Record<string, unknown>;
  if (data.mode !== "solo" && data.mode !== "multiplayer") return null;
  const count = typeof data.player_count === "number" && Number.isFinite(data.player_count)
    ? Math.round(Math.max(1, Math.min(8, data.player_count))) : null;
  const duration = typeof data.duration_seconds === "number" && Number.isFinite(data.duration_seconds)
    ? Math.round(Math.max(0, Math.min(86400, data.duration_seconds))) : null;
  if (name.startsWith("room_") && data.mode !== "multiplayer") return null;
  switch (name) {
    case "room_create_attempt":
    case "rematch_selected":
      return { mode: data.mode };
    case "room_join_attempt":
      return data.method === "code" || data.method === "list" ? { mode: data.mode, method: data.method } : null;
    case "room_entered":
      return (data.entry === "create" || data.entry === "join") && count !== null
        ? { mode: data.mode, entry: data.entry, player_count: count } : null;
    case "room_join_failed":
      return data.reason === "connection" || data.reason === "rejected" ? { mode: data.mode, reason: data.reason } : null;
    case "match_started":
      return count !== null ? { mode: data.mode, player_count: count } : null;
    case "match_completed":
      return duration !== null && ["wardens", "impostor", "unknown"].includes(String(data.outcome))
        ? { mode: data.mode, duration_seconds: duration, outcome: String(data.outcome) } : null;
    case "match_left":
      return duration !== null ? { mode: data.mode, duration_seconds: duration } : null;
    default:
      return null;
  }
}

export class AnalyticsController {
  private consent: AnalyticsConsent = "unknown";
  private expiresAt = 0;
  private initialized = false;
  private configuredTag = false;
  private tagLoaded = false;
  private tagFailed = false;
  private listeners = new Set<(consent: AnalyticsConsent) => void>();
  private readonly host: AnalyticsWindow;
  private readonly measurementId: string;
  private readonly enabled: boolean;
  private readonly now: () => number;
  private readonly debug: boolean;

  constructor(options: { host: Window; measurementId?: string; production?: boolean; debug?: boolean; now?: () => number }) {
    this.host = options.host as AnalyticsWindow;
    this.measurementId = options.measurementId?.trim() ?? "";
    this.debug = options.debug === true;
    this.now = options.now ?? Date.now;
    const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(this.host.location.hostname);
    this.enabled = /^G-[A-Z0-9]{6,20}$/.test(this.measurementId)
      && (options.production === true || this.debug) && (!local || this.debug);
  }

  isConfigured() { return this.enabled; }

  isPrivacyRestricted() {
    const navigator = this.host.navigator as Navigator & { globalPrivacyControl?: boolean };
    return navigator.globalPrivacyControl === true || navigator.doNotTrack === "1";
  }

  getConsent(): AnalyticsConsent {
    if (this.isPrivacyRestricted() && this.consent !== "denied") this.applyConsent("denied", 0);
    if (this.expiresAt > 0 && this.expiresAt <= this.now()) this.applyConsent("unknown", 0);
    return this.consent;
  }

  subscribe(listener: (consent: AnalyticsConsent) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  initialize() {
    if (this.initialized) return;
    this.initialized = true;
    this.host.addEventListener("storage", this.onStorage);
    this.readChoice();
  }

  setConsent(consent: "granted" | "denied") {
    this.initialize();
    const choice = this.isPrivacyRestricted() ? "denied" : consent;
    const expiresAt = this.now() + CONSENT_LIFETIME;
    try {
      this.host.localStorage.setItem(ANALYTICS_CONSENT_KEY, JSON.stringify({ consent: choice, expiresAt }));
    } catch { /* A blocked preference store must never break gameplay. */ }
    this.applyConsent(choice, expiresAt);
  }

  track<K extends keyof AnalyticsEventMap>(name: K, params: AnalyticsEventMap[K]) {
    this.initialize();
    if (!this.enabled || this.getConsent() !== "granted") return false;
    const clean = sanitizeAnalyticsEvent(name, params);
    if (!clean) return false;
    this.startTag();
    if (!this.configuredTag) return false;
    // Bound the queue if a blocker prevents gtag.js from loading.
    if (!this.tagLoaded && (this.host.dataLayer?.length ?? 0) > 100) return false;
    try {
      this.host.gtag?.("event", name, { ...clean, ...this.pageContext(), send_to: this.measurementId });
      return this.configuredTag;
    } catch { return false; }
  }

  private pageContext() {
    // No query, fragment, referrer URL or arbitrary route segment is sent.
    const path = this.host.location.pathname === "/privacy" ? "/privacy" : "/";
    return { page_location: `${this.host.location.origin}${path}`, page_title: "Moonwarden", page_referrer: "" };
  }

  private readChoice() {
    let consent: AnalyticsConsent = "unknown";
    let expiresAt = 0;
    try {
      const saved = JSON.parse(this.host.localStorage.getItem(ANALYTICS_CONSENT_KEY) ?? "null");
      if ((saved?.consent === "granted" || saved?.consent === "denied")
        && typeof saved.expiresAt === "number" && saved.expiresAt > this.now()
        && saved.expiresAt <= this.now() + CONSENT_LIFETIME) {
        consent = saved.consent;
        expiresAt = saved.expiresAt;
      }
    } catch { /* Malformed or unavailable storage defaults to no tracking. */ }
    this.applyConsent(consent, expiresAt);
  }

  private onStorage = (event: StorageEvent) => {
    if (event.key === ANALYTICS_CONSENT_KEY || event.key === null) this.readChoice();
  };

  private applyConsent(consent: AnalyticsConsent, expiresAt: number) {
    const previous = this.consent;
    this.consent = this.isPrivacyRestricted() ? "denied" : consent;
    this.expiresAt = expiresAt;
    if (this.enabled) {
      this.host[`ga-disable-${this.measurementId}`] = this.consent !== "granted";
      if (this.consent === "granted") {
        if (previous !== "granted") this.tagFailed = false;
        if (this.configuredTag && previous !== "granted") {
          try { this.host.gtag?.("consent", "update", { ...DENIED, analytics_storage: "granted" }); } catch { /* Nonessential. */ }
        }
        this.startTag();
      }
      else {
        // Disable before updating consent; do not load a tag just to decline it.
        this.discardPendingEvents();
        if (this.configuredTag) {
          try { this.host.gtag?.("consent", "update", { ...DENIED }); } catch { /* Nonessential. */ }
        }
        this.clearCookies();
      }
    }
    if (previous !== this.consent || !this.configuredTag) {
      for (const listener of this.listeners) listener(this.consent);
    }
  }

  private startTag() {
    if (this.configuredTag || this.tagFailed || !this.enabled || this.consent !== "granted" || this.isPrivacyRestricted()) return;
    try {
      this.host[`ga-disable-${this.measurementId}`] = false;
      const host = this.host;
      host.dataLayer = host.dataLayer ?? [];
      // Google tag's official queue uses IArguments, not an arbitrary event object.
      // eslint-disable-next-line prefer-rest-params
      host.gtag = host.gtag ?? function () { host.dataLayer!.push(arguments); };
      host.gtag("consent", "default", { ...DENIED });
      host.gtag("set", "ads_data_redaction", true);
      host.gtag("set", "url_passthrough", false);
      host.gtag("consent", "update", { ...DENIED, analytics_storage: "granted" });
      host.gtag("js", new Date(this.now()));
      host.gtag("config", this.measurementId, {
        ...this.pageContext(),
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        cookie_domain: "none",
        cookie_expires: CONSENT_LIFETIME / 1000,
        ...(this.debug ? { debug_mode: true } : {}),
      });
      this.configuredTag = true;
      const script = host.document.createElement("script");
      script.id = SCRIPT_ID;
      script.async = true;
      script.referrerPolicy = "no-referrer";
      script.onload = () => { this.tagLoaded = true; };
      script.onerror = () => {
        this.tagFailed = true;
        this.configuredTag = false;
        host[`ga-disable-${this.measurementId}`] = true;
        this.discardPendingEvents();
      };
      script.src = `https://www.googletagmanager.com/gtag/js?id=${this.measurementId}`;
      host.document.head.appendChild(script);
      host.gtag("event", "page_view", { ...this.pageContext(), send_to: this.measurementId });
    } catch {
      // A blocked third-party tag must never interrupt play or consent controls.
      this.configuredTag = false;
      this.tagFailed = true;
      this.host[`ga-disable-${this.measurementId}`] = true;
      this.discardPendingEvents();
    }
  }

  private clearCookies() {
    for (const name of ["_ga", `_ga_${this.measurementId.slice(2)}`]) {
      try { this.host.document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`; } catch { /* Sandboxed document. */ }
    }
  }

  private discardPendingEvents() {
    // If gtag.js is delayed, a later opt-in must not replay pre-withdrawal events.
    // Do not mutate the tag's history after it has loaded and consumed the queue.
    if (this.tagLoaded || !this.host.dataLayer) return;
    this.host.dataLayer = this.host.dataLayer.filter(command => {
      if (!command || typeof command !== "object" || !("0" in command)) return true;
      const args = command as { 0: unknown; 2?: unknown };
      const payload = args[2] as { send_to?: unknown } | undefined;
      return args[0] !== "event" || payload?.send_to !== this.measurementId;
    });
  }
}

let controller: AnalyticsController | undefined;
function runtime() {
  if (typeof window === "undefined") return undefined;
  controller ??= new AnalyticsController({
    host: window,
    measurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    production: process.env.NODE_ENV === "production",
    debug: process.env.NEXT_PUBLIC_GA_DEBUG === "true",
  });
  return controller;
}

export function initializeAnalytics() { runtime()?.initialize(); }
export function isAnalyticsConfigured() { return runtime()?.isConfigured() ?? false; }
export function isAnalyticsPrivacyRestricted() { return runtime()?.isPrivacyRestricted() ?? false; }
export function getAnalyticsConsent(): AnalyticsConsent { return runtime()?.getConsent() ?? "unknown"; }
export function setAnalyticsConsent(consent: "granted" | "denied") { runtime()?.setConsent(consent); }
export function subscribeAnalyticsConsent(listener: (consent: AnalyticsConsent) => void) {
  return runtime()?.subscribe(listener) ?? (() => {});
}
export function trackGameEvent<K extends keyof AnalyticsEventMap>(name: K, params: AnalyticsEventMap[K]) {
  return runtime()?.track(name, params) ?? false;
}
