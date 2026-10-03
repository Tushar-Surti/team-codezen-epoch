import type { Metadata } from "next";
import { Geist, Geist_Mono, IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Devanagari, Noto_Sans_Devanagari } from "next/font/google";

import { THEME_SCRIPT } from "@/lib/theme-script";

import { Providers } from "./providers";
import "./globals.css";

// Light theme: IBM Plex, with its matching Devanagari and Plex Mono for script text.
const plex = IBM_Plex_Sans({ subsets: ["latin", "latin-ext"], axes: ["wdth"], variable: "--font-plex" });
const plexDeva = IBM_Plex_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "500", "600", "700"], variable: "--font-plex-deva" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], variable: "--font-plex-mono" });
// Dark theme: Geist, Geist Mono for timecodes, Noto Sans Devanagari. Not preloaded; light is the default.
const geist = Geist({ subsets: ["latin", "latin-ext"], variable: "--font-geist", preload: false });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", preload: false });
const notoDeva = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-noto-deva", preload: false });

const fontVars = [plex, plexDeva, plexMono, geist, geistMono, notoDeva].map((f) => f.variable).join(" ");

export const metadata: Metadata = {
  title: "Retent AI",
  description: "Predict the drop. Fix the video. Keep them watching.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVars} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
