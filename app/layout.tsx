import type { Metadata } from "next";
import "./globals.css";
import "./lobby-studio.css";
import "./play-menu.css";
import "./home-welcome.css";
import "./consumption.css";
import AnalyticsConsentControls from "./analytics-consent";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Moonwarden — Trust the Light",
  description:
    "A moonlit mountain social-deduction game. Restore ancient wards, survive the Ordeal, and expose the hidden Impostor.",
  openGraph: {
    title: "Moonwarden — Trust the Light",
    description: "Restore the moon wards, survive the Ordeal, and expose the shadow in your circle.",
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "Moonwarden circle beneath the moon at Silverpine Summit" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Moonwarden — Trust the Light",
    description: "Restore the moon wards, survive the Ordeal, and expose the shadow in your circle.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <AnalyticsConsentControls />
      </body>
    </html>
  );
}
