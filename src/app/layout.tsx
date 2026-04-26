import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Cinzel, Crimson_Text } from "next/font/google";
import "./globals.css";
import AudioProvider from "@/components/AudioProvider";

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
};

export const metadata: Metadata = {
  title: "Armies & Magic",
  description: "A fantasy collectible card game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cinzel.variable} ${crimsonText.variable}`}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        // Browser extensions (Grammarly, ColorZilla…) inject attributes
        // on <body> before React hydrates, which produces a noisy SSR
        // hydration mismatch on every page load. Suppressing here only
        // affects this single element (children still get full
        // hydration checks) and is the canonical fix recommended by the
        // React team for this scenario.
        suppressHydrationWarning
      >
        <AudioProvider />
        {children}
      </body>
    </html>
  );
}
