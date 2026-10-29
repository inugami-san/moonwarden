import assert from "node:assert/strict";
import test from "node:test";
import { AnalyticsController, ANALYTICS_CONSENT_KEY, sanitizeAnalyticsEvent } from "../app/analytics.ts";

const ID = "G-TEST123456";
const lifetime = 180 * 86400 * 1000;
function browser(options = {}) {
  let now = 1000000;
  const storage = new Map();
  const scripts = [];
  const erased = [];
  const events = new Map();
  const host = {
    location: new URL(options.url ?? "https://moonwarden.example/?room=PRIVATE#secret"),
    navigator: options.navigator ?? {},
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    document: {
      createElement: () => ({}),
      head: { appendChild: node => { scripts.push(node); } },
      set cookie(value) { erased.push(value); },
    },
    addEventListener: (name, fn) => events.set(name, fn),
  };
  const controller = new AnalyticsController({ host, measurementId: ID, production: true, now: () => now, ...options });
  return {
    host, storage, scripts, erased, controller,
    commands: () => (host.dataLayer ?? []).map(value => Array.from(value)),
    advance: value => { now += value; },
    storageChanged: key => events.get("storage")?.({ key }),
  };
}

test("no Google script, queue or event before explicit consent", () => {
  const b = browser();
  b.controller.initialize();
  assert.equal(b.controller.getConsent(), "unknown");
  assert.equal(b.controller.track("match_started", { mode: "solo", player_count: 6 }), false);
  assert.equal(b.scripts.length, 0);
  assert.equal(b.host.dataLayer, undefined);
  b.controller.setConsent("denied");
  assert.equal(b.scripts.length, 0);
  assert.equal(b.host.dataLayer, undefined);
});

test("missing/invalid ID and local/development traffic remain disabled", () => {
  for (const options of [
    { measurementId: "" }, { measurementId: "GTM-TEST123" },
    { measurementId: "G-TEST\"<script>" }, { production: false },
    { url: "http://localhost:3000/" }, { url: "http://127.0.0.1:3000/" },
    { url: "http://[::1]:3000/" },
  ]) {
    const b = browser(options);
    b.controller.setConsent("granted");
    assert.equal(b.controller.isConfigured(), false);
    assert.equal(b.scripts.length, 0);
    assert.equal(b.controller.track("match_started", { mode: "solo", player_count: 6 }), false);
  }
});

test("explicit debug opt-in permits a separate development property", () => {
  const b = browser({ url: "http://localhost:3000/", production: false, debug: true });
  b.controller.setConsent("granted");
  assert.equal(b.scripts.length, 1);
  const config = b.commands().find(args => args[0] === "config")[2];
  assert.equal(config.debug_mode, true);
});

test("grant loads once, default denial precedes config, ads stay denied", () => {
  const b = browser();
  b.controller.setConsent("granted");
  b.controller.initialize();
  b.controller.setConsent("granted");
  assert.equal(b.scripts.length, 1);
  assert.equal(b.scripts[0].async, true);
  assert.equal(b.scripts[0].referrerPolicy, "no-referrer");
  assert.equal(b.scripts[0].src, `https://www.googletagmanager.com/gtag/js?id=${ID}`);
  const commands = b.commands();
  assert.deepEqual(commands[0], ["consent", "default", {
    analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
  }]);
  const config = commands.find(args => args[0] === "config")[2];
  assert.equal(config.send_page_view, false);
  assert.equal(config.allow_google_signals, false);
  assert.equal(config.allow_ad_personalization_signals, false);
  assert.equal(config.cookie_domain, "none");
  assert.equal(commands.filter(args => args[0] === "event" && args[1] === "page_view").length, 1);
  assert.equal(commands.some(args => args[2]?.ad_storage === "granted"), false);
});

test("query/hash/referrer/free text/identifiers cannot enter event payloads", () => {
  const b = browser();
  b.controller.setConsent("granted");
  assert.equal(b.controller.track("match_started", {
    mode: "multiplayer", player_count: 6, player_name: "Secret Name", room_code: "SECRET", text: "Private chat", user_id: "private-id",
  }), true);
  assert.deepEqual(b.commands().at(-1)[2], {
    mode: "multiplayer", player_count: 6, page_location: "https://moonwarden.example/", page_title: "Moonwarden", page_referrer: "", send_to: ID,
  });
  assert.doesNotMatch(JSON.stringify(b.commands()), /PRIVATE|secret|Private chat|Secret Name|private-id/);
  const privatePath = browser({ url: "https://moonwarden.example/room/SECRET?token=private" });
  privatePath.controller.setConsent("granted");
  assert.equal(privatePath.commands().at(-1)[2].page_location, "https://moonwarden.example/");
});

test("event schema rejects unexpected names/enums and clamps numeric fields", () => {
  assert.equal(sanitizeAnalyticsEvent("chat_message", { mode: "solo", text: "private" }), null);
  assert.equal(sanitizeAnalyticsEvent("room_join_failed", { mode: "solo", reason: "connection" }), null);
  assert.equal(sanitizeAnalyticsEvent("room_join_failed", { mode: "multiplayer", reason: "private server error" }), null);
  assert.equal(sanitizeAnalyticsEvent("match_completed", { mode: "solo", duration_seconds: Infinity, outcome: "wardens" }), null);
  assert.equal(sanitizeAnalyticsEvent("match_started", { mode: "Secret Name", player_count: 6 }), null);
  assert.deepEqual(sanitizeAnalyticsEvent("match_started", { mode: "solo", player_count: 100 }), { mode: "solo", player_count: 8 });
  assert.deepEqual(sanitizeAnalyticsEvent("match_left", { mode: "solo", duration_seconds: -20 }), { mode: "solo", duration_seconds: 0 });
});

test("withdrawal stops events, disables collection and removes only GA cookies", () => {
  const b = browser();
  b.controller.setConsent("granted");
  b.controller.setConsent("denied");
  assert.equal(b.host[`ga-disable-${ID}`], true);
  const count = b.commands().length;
  assert.equal(b.controller.track("match_started", { mode: "solo", player_count: 6 }), false);
  assert.equal(b.commands().length, count);
  assert.ok(b.erased.some(value => value.startsWith("_ga=; Max-Age=0;")));
  assert.ok(b.erased.some(value => value.startsWith("_ga_TEST123456=; Max-Age=0;")));
  assert.ok(b.erased.every(value => value.startsWith("_ga")));
  b.controller.setConsent("granted");
  assert.equal(b.host[`ga-disable-${ID}`], false);
  assert.equal(b.scripts.length, 1);
  assert.equal(b.commands().at(-1)[2].analytics_storage, "granted");
});

test("saved choices expire and cross-tab withdrawal immediately disables events", () => {
  const b = browser();
  b.storage.set(ANALYTICS_CONSENT_KEY, JSON.stringify({ consent: "granted", expiresAt: 1000000 + lifetime }));
  b.controller.initialize();
  assert.equal(b.scripts.length, 1);
  b.storage.set(ANALYTICS_CONSENT_KEY, JSON.stringify({ consent: "denied", expiresAt: 1000000 + lifetime }));
  b.storageChanged(ANALYTICS_CONSENT_KEY);
  assert.equal(b.controller.getConsent(), "denied");
  b.controller.setConsent("granted");
  b.advance(lifetime + 1);
  assert.equal(b.controller.getConsent(), "unknown");
  assert.equal(b.host[`ga-disable-${ID}`], true);
});

test("delayed tag cannot replay unsent gameplay after withdrawal and regrant", () => {
  const b = browser();
  b.controller.setConsent("granted");
  b.controller.track("match_started", { mode: "multiplayer", player_count: 6 });
  assert.equal(b.commands().filter(args => args[0] === "event").length, 2);
  b.controller.setConsent("denied");
  assert.equal(b.commands().filter(args => args[0] === "event").length, 0);
  b.controller.setConsent("granted");
  assert.equal(b.commands().filter(args => args[0] === "event").length, 0);
  b.controller.track("match_started", { mode: "solo", player_count: 4 });
  assert.equal(b.commands().filter(args => args[0] === "event").length, 1);
  assert.equal(b.commands().at(-1)[2].mode, "solo");
});

test("malformed/expired storage and storage failures fail closed", () => {
  for (const value of ["not JSON", '{"consent":"yes"}', JSON.stringify({ consent: "granted", expiresAt: 1 })]) {
    const b = browser();
    b.storage.set(ANALYTICS_CONSENT_KEY, value);
    b.controller.initialize();
    assert.equal(b.controller.getConsent(), "unknown");
    assert.equal(b.scripts.length, 0);
  }
  const b = browser();
  b.host.localStorage.getItem = () => { throw new Error("Blocked storage"); };
  b.host.localStorage.setItem = () => { throw new Error("Blocked storage"); };
  assert.doesNotThrow(() => b.controller.initialize());
  assert.equal(b.scripts.length, 0);
  assert.doesNotThrow(() => b.controller.setConsent("denied"));
});

test("GPC and DNT override saved or new opt-in without loading Google", () => {
  for (const navigator of [{ globalPrivacyControl: true }, { doNotTrack: "1" }]) {
    const b = browser({ navigator });
    b.storage.set(ANALYTICS_CONSENT_KEY, JSON.stringify({ consent: "granted", expiresAt: 1000000 + lifetime }));
    b.controller.initialize();
    b.controller.setConsent("granted");
    assert.equal(b.controller.isPrivacyRestricted(), true);
    assert.equal(b.controller.getConsent(), "denied");
    assert.equal(b.scripts.length, 0);
    assert.equal(b.controller.track("match_started", { mode: "solo", player_count: 6 }), false);
  }
});

test("privacy subscribers receive changes and unsubscribe cleanly", () => {
  const b = browser();
  const values = [];
  const unsubscribe = b.controller.subscribe(value => values.push(value));
  b.controller.initialize();
  b.controller.setConsent("granted");
  unsubscribe();
  b.controller.setConsent("denied");
  assert.deepEqual(values, ["unknown", "granted"]);
});

test("a blocked third-party script or gtag cannot throw into gameplay", () => {
  const b = browser();
  b.host.document.head.appendChild = () => { throw new Error("Blocked script"); };
  assert.doesNotThrow(() => b.controller.setConsent("granted"));
  assert.doesNotThrow(() => b.controller.track("match_started", { mode: "solo", player_count: 6 }));
  const c = browser();
  c.controller.setConsent("granted");
  c.host.gtag = () => { throw new Error("Blocked tracker"); };
  assert.equal(c.controller.track("match_started", { mode: "solo", player_count: 6 }), false);
  assert.doesNotThrow(() => c.controller.setConsent("denied"));
});

test("blocked-script event queue remains bounded", () => {
  const b = browser();
  b.controller.setConsent("granted");
  for (let n = 0; n < 1000; n++) b.controller.track("match_started", { mode: "solo", player_count: 6 });
  assert.ok(b.host.dataLayer.length <= 101);
  const blocked = browser();
  blocked.host.document.head.appendChild = () => { throw new Error("Blocked script"); };
  blocked.controller.setConsent("granted");
  for (let n = 0; n < 1000; n++) blocked.controller.track("match_started", { mode: "solo", player_count: 6 });
  assert.ok(blocked.host.dataLayer.length <= 101);
});

test("successfully loaded tags do not mistake retained history for a pending queue", () => {
  const b = browser();
  b.controller.setConsent("granted");
  b.scripts[0].onload();
  for (let n = 0; n < 1000; n++) assert.equal(b.controller.track("match_started", { mode: "solo", player_count: 6 }), true);
  assert.equal(b.commands().filter(args => args[0] === "event" && args[1] === "match_started").length, 1000);
});
