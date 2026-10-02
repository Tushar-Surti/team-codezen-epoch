import type { Metadata } from "next";
import { Anek_Devanagari, Anek_Latin, Courier_Prime, Tiro_Devanagari_Hindi } from "next/font/google";

import { Providers } from "./providers";
import "./globals.css";

const anekLatin = Anek_Latin({ subsets: ["latin", "latin-ext"], axes: ["wdth"], variable: "--font-anek-latin" });
const anekDeva = Anek_Devanagari({ subsets: ["devanagari"], axes: ["wdth"], variable: "--font-anek-deva" });
const courier = Courier_Prime({ subsets: ["latin", "latin-ext"], weight: ["400", "700"], variable: "--font-courier" });
const tiroDeva = Tiro_Devanagari_Hindi({ subsets: ["devanagari"], weight: "400", variable: "--font-tiro-deva" });

export const metadata: Metadata = {
  title: "Retent AI",
  description: "Predict the drop. Fix the video. Keep them watching.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anekLatin.variable} ${anekDeva.variable} ${courier.variable} ${tiroDeva.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
