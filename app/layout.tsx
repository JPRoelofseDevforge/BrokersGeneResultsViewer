import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import {
  Bricolage_Grotesque,
  JetBrains_Mono,
  Manrope,
} from "next/font/google";

import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const body = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

const title = "SAM. | Your gene blueprint";
const description =
  "A server-processed gene report that shows where everyday choices carry the most weight.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host = forwardedHost ?? requestHeaders.get("host") ?? "localhost:3000";
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : host.startsWith("localhost")
        ? "http"
        : "https";
  let origin: URL;

  try {
    origin = new URL(`${protocol}://${host}`);
  } catch {
    origin = new URL("http://localhost:3000");
  }

  const socialImage = new URL("/og-broker-day-gene.png", origin).toString();

  return {
    metadataBase: origin,
    title,
    description,
    referrer: "no-referrer",
    icons: {
      icon: "/icon.png",
      shortcut: "/icon.png",
    },
    openGraph: {
      type: "website",
      siteName: "SAM",
      title,
      description,
      images: [
        {
          url: socialImage,
          width: 1200,
          height: 630,
          alt: "SAM — Know what responds. Spend attention there.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
    robots: {
      index: false,
      follow: false,
      nocache: true,
    },
  };
}

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#ebe6da",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        {children}
      </body>
    </html>
  );
}
