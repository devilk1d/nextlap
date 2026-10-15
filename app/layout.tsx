import type { Metadata } from "next";
import { Barlow, Barlow_Condensed, JetBrains_Mono, Michroma } from "next/font/google";
import { TooltipLayer } from "@/components/ui/Tooltip";
import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
});

const michroma = Michroma({
  variable: "--font-michroma",
  subsets: ["latin", "latin-ext"],
  weight: "400",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Next Lap",
  description: "Lap-time forecasts and race replay for Formula 1, 2022–2025.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const fonts = [barlow, barlowCondensed, michroma, jetbrainsMono].map((f) => f.variable).join(" ");
  return (
    <html lang="en" className={`${fonts} antialiased`}>
      <body>
        {children}
        <TooltipLayer />
      </body>
    </html>
  );
}
