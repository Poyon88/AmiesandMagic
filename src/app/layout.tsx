import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Cinzel, Crimson_Text } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "./globals.css";
import "@/components/vitrine/vitrine.css";
import { bricolage } from "@/components/vitrine/font";
import CorpsDuSite from "@/components/vitrine/CorpsDuSite";
import AudioProvider from "@/components/AudioProvider";
import KeywordIconPreloader from "@/components/KeywordIconPreloader";
import LocaleMigration from "@/components/LocaleMigration";
import { headers } from "next/headers";
import { GeoProvider } from "@/components/shared/GeoProvider";
import FeedbackHost from "@/components/feedback/FeedbackHost";
import { geoContext } from "@/lib/geo/rules";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
  variable: "--font-cinzel",
});

const crimsonText = Crimson_Text({
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  variable: "--font-crimson",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // viewport-fit=cover lets us read env(safe-area-inset-*) so fixed UI
  // (settings, end-turn) doesn't slide under the notch in landscape.
  viewportFit: "cover",
};

export const metadata: Metadata = {
  // Le site est déjà traduit en huit langues : on demande au navigateur de ne
  // PAS proposer sa traduction automatique, qui retraduisait le français en
  // français approximatif et jusqu'au nom du jeu.
  other: { google: "notranslate" },
  title: "Armies of Legends",
  description: "A fantasy collectible card game",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  // Pays de connexion et fonctions qu'il ouvre (réglage /admin/pays) : lu une
  // fois ici, pour que chaque écran affiche d'emblée ce qui est disponible.
  const { country, rules } = await geoContext(await headers());
  const geo = {
    country,
    features: {
      gold_purchases: rules.gold_purchases,
      tickets: rules.tickets,
      auctions: rules.auctions,
      cash_prizes: rules.cash_prizes,
    },
    minAge: rules.min_age,
  };
  return (
    <html
      lang={locale}
      translate="no"
      className={`${cinzel.variable} ${crimsonText.variable}`}
      // Certaines extensions / outils de navigateur (ex. sur iPad Safari)
      // injectent un attribut sur <html> avant l'hydratation (ex.
      // `__gcrremoteframetoken`), provoquant un mismatch SSR bruyant. On le
      // supprime ici comme sur <body> ; n'affecte que cet élément.
      suppressHydrationWarning
    >
      <CorpsDuSite className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} antialiased`}>
        <NextIntlClientProvider>
          <LocaleMigration />
          <AudioProvider />
          <KeywordIconPreloader />
          <GeoProvider value={geo}>{children}</GeoProvider>
          <FeedbackHost />
        </NextIntlClientProvider>
      </CorpsDuSite>
    </html>
  );
}
