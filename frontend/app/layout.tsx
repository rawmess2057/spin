import type { Metadata } from "next";
import { Inter, Contrail_One, Oswald, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./lib/providers";
import { AppShell } from "./components/layout/app-shell";
import { ErrorBoundary } from "./components/error-boundary";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const contrailOne = Contrail_One({
  variable: "--font-contrail",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Spin — Lucky Sevens",
  description:
    "Vegas-style provably fair Solana casino. Buy diamonds with SOL, spin without a wallet prompt, cash out any time.",
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
        className={`${inter.variable} ${oswald.variable} ${contrailOne.variable} ${robotoMono.variable} antialiased`}
      >
        <Providers>
          <ErrorBoundary>
            <AppShell>{children}</AppShell>
          </ErrorBoundary>
        </Providers>
      </body>
    </html>
  );
}
