import type { Metadata } from "next";
import Link from "next/link";
import { AnalyticsSettingsButton } from "../analytics-consent";
import "../analytics-consent.css";

export const metadata: Metadata = {
  title: "Privacy — Moonwarden",
  description: "How optional analytics work in Moonwarden and how to control your choice.",
};

export default function PrivacyPage() {
  return (
    <main className="mw-privacy-page">
      <article>
        <Link className="mw-privacy-back" href="/">← Back to Moonwarden</Link>
        <h1>Privacy in the glade</h1>
        <p>
          Moonwarden’s optional analytics help us learn where players get stuck, whether matches finish,
          and what to improve. You can play without allowing analytics.
        </p>
        <p className="mw-privacy-date">Analytics disclosure · Updated 20 October 2026</p>

        <h2>Your choice comes first</h2>
        <p>
          This integration does not load Google Analytics or send analytics requests until you choose
          “Allow analytics.” “No thanks” keeps it off. Do Not Track and Global Privacy Control browser
          preferences are also respected. If analytics are not configured for this environment, they remain
          inactive. Local development is disabled unless explicitly configured for analytics debugging.
        </p>
        <AnalyticsSettingsButton />

        <h2>What optional analytics measure</h2>
        <ul>
          <li>Limited page visits and general browser/device information.</li>
          <li>Game steps such as creating or joining a room, starting or completing a match, and leaving a match early.</li>
          <li>General room-join failures, without raw error messages or chat content.</li>
        </ul>
        <p>
          Google Analytics may set first-party cookies, such as <code>_ga</code> and <code>_ga_*</code>,
          to distinguish browser visits and sessions. Google may derive coarse geographic information
          from your connection. We do not request precise location access for analytics or enable Google
          advertising features through this integration.
        </p>

        <h2>What we do not send</h2>
        <p>
          Analytics events do not include player names, chat messages, room or invitation codes, free-text
          inputs, precise locations, or account/user IDs. They do not record individual player movements.
          Google Analytics still uses its own cookie-based browser identifiers when you allow analytics.
          This is separate from the connection data the game’s room service needs to run a live match.
        </p>

        <h2>Changing or withdrawing consent</h2>
        <p>
          Open “Privacy settings” at the bottom-left of the site at any time. Turning analytics off stops
          further collection by this integration and removes Google Analytics cookies accessible to this
          site. This does not automatically delete information Google has already received. Your preference
          is stored locally on this browser, so other browsers or devices may need a separate choice.
        </p>
        <p>
          The local preference is remembered for up to 180 days, not used to identify you across devices.
          Clearing browser storage may reset your preference; analytics will again stay off until allowed.
        </p>

        <h2>Google’s processing</h2>
        <p>
          Google processes the analytics information under its own terms and privacy practices. Read
          the <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a> and
          learn <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noreferrer">how Google uses data from partner sites</a>.
        </p>
      </article>
    </main>
  );
}
