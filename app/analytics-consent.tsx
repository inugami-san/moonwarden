"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  getAnalyticsConsent,
  initializeAnalytics,
  isAnalyticsConfigured,
  isAnalyticsPrivacyRestricted,
  setAnalyticsConsent,
  subscribeAnalyticsConsent,
  type AnalyticsConsent,
} from "./analytics";
import "./analytics-consent.css";

const SETTINGS_EVENT = "moonwarden:open-privacy-settings";

export function AnalyticsSettingsButton({ compact = false }: { compact?: boolean }) {
  return (
    <button
      type="button"
      className={compact ? "mw-privacy-game-button" : "mw-privacy-inline-button"}
      aria-label={compact ? "Privacy settings" : undefined}
      aria-haspopup="dialog"
      onKeyDown={(event) => event.stopPropagation()}
      onClick={() => window.dispatchEvent(new Event(SETTINGS_EVENT))}
    >
      {compact ? "Privacy settings" : "Open privacy settings"}
    </button>
  );
}

export function AnalyticsConsentControls() {
  const [consent, setConsent] = useState<AnalyticsConsent>("unknown");
  const [configured, setConfigured] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const refresh = (nextConsent: AnalyticsConsent) => {
      setConsent(nextConsent);
      setConfigured(isAnalyticsConfigured());
      setRestricted(isAnalyticsPrivacyRestricted());
    };
    const unsubscribe = subscribeAnalyticsConsent(refresh);
    initializeAnalytics();
    refresh(getAnalyticsConsent());

    const openSettings = () => {
      const dialog = dialogRef.current;
      if (!dialog || dialog.open) return;
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    };
    window.addEventListener(SETTINGS_EVENT, openSettings);
    return () => {
      unsubscribe();
      window.removeEventListener(SETTINGS_EVENT, openSettings);
    };
  }, []);

  const closeSettings = () => dialogRef.current?.close();
  const choose = (choice: "granted" | "denied") => {
    setAnalyticsConsent(choice);
    closeSettings();
  };
  const openSettings = () => window.dispatchEvent(new Event(SETTINGS_EVENT));

  return (
    <aside className="mw-privacy-controls" aria-label="Privacy controls">
      {configured && !restricted && consent === "unknown" ? (
        <section
          className="mw-consent-notice"
          aria-label="Optional analytics"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <span className="mw-privacy-eyebrow">A little insight. Your choice.</span>
          <h2>Help the glade grow?</h2>
          <p>
            Optional Google Analytics cookies help us understand how players join and finish games.
            We don’t send player names, chat, or room codes. Playing works either way.
          </p>
          <div className="mw-consent-actions">
            <button type="button" onClick={() => choose("granted")}>Allow analytics</button>
            <button type="button" onClick={() => choose("denied")}>No thanks</button>
          </div>
          <Link href="/privacy">What we measure</Link>
        </section>
      ) : null}
      <button
        type="button"
        className="mw-privacy-launcher"
        onClick={openSettings}
        onKeyDown={(event) => event.stopPropagation()}
        aria-haspopup="dialog"
      >
        <span aria-hidden="true">◌</span> Privacy settings
      </button>
      <dialog
        ref={dialogRef}
        className="mw-privacy-dialog"
        aria-labelledby="mw-privacy-title"
        aria-describedby="mw-privacy-description"
        onKeyDown={(event) => event.stopPropagation()}
        onClose={() => {
          if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeSettings();
        }}
      >
        <div className="mw-privacy-dialog-content">
          <div className="mw-privacy-dialog-top">
            <span className="mw-privacy-eyebrow">Moonwarden · Privacy</span>
            <button type="button" className="mw-privacy-close" aria-label="Close privacy settings" onClick={closeSettings}>×</button>
          </div>
          <h2 id="mw-privacy-title">Your game. Your choice.</h2>
          <p id="mw-privacy-description">
            Optional analytics help improve the journey from finding a room to finishing a match.
            No analytics requests are made before you allow them.
          </p>
          <div className="mw-privacy-status" role="status">
            {!configured ? (
              <>
                <strong>Analytics are inactive.</strong>
                <span>This site has no active analytics configuration in this environment. Nothing is being collected by this integration.</span>
              </>
            ) : restricted ? (
              <>
                <strong>Your browser’s privacy request is respected.</strong>
                <span>Do Not Track or Global Privacy Control is enabled, so optional analytics remain off.</span>
              </>
            ) : (
              <>
                <strong>Analytics: {consent === "granted" ? "allowed" : consent === "denied" ? "off" : "not enabled"}</strong>
                <span>You can change your choice here at any time. Rejecting analytics will not affect gameplay.</span>
              </>
            )}
          </div>
          <p>
            If enabled, Google Analytics receives limited page, browser/device, and gameplay event information.
            Google may derive a coarse location from your connection. We don’t send player names, messages,
            room codes, user IDs, free text, or precise locations, and we don’t enable advertising features.
          </p>
          <p>
            Your choice is stored on this browser. Withdrawing stops further analytics and clears the Google
            Analytics cookies accessible to this site; it does not erase data already received by Google.
          </p>
          <p className="mw-privacy-dialog-links">
            <Link href="/privacy" onClick={closeSettings}>Full privacy details</Link>
            <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google’s privacy policy ↗</a>
          </p>
          {configured && !restricted ? (
            <div className="mw-consent-actions">
              <button type="button" onClick={() => choose("granted")}>Allow analytics</button>
              <button type="button" onClick={() => choose("denied")}>{consent === "granted" ? "Turn analytics off" : "Keep analytics off"}</button>
            </div>
          ) : (
            <button type="button" className="mw-privacy-done" onClick={closeSettings}>Back to the glade</button>
          )}
        </div>
      </dialog>
    </aside>
  );
}

export default AnalyticsConsentControls;
