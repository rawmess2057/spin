import type { Metadata } from "next";
import { Inter, Orbitron, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./components/providers";
import { AppHeader } from "./components/app-header";
import { GridBackground } from "./components/grid-background";
import { ErrorBoundary } from "./components/error-boundary";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  display: "swap",
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Spin — Neon Slots",
  description:
    "Provably fair Solana casino. Neon Slots with ORAO VRF randomness, built on @solana/kit.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${orbitron.variable} ${robotoMono.variable} antialiased`}
      >
        <Providers>
          <ErrorBoundary>
            <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
              <GridBackground />
              <div className="relative z-10">
                <AppHeader />
                {children}
              </div>
            </div>
          </ErrorBoundary>
        </Providers>
      </body>
    </html>
  );
}
