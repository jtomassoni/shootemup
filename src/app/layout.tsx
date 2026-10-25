import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { GAME_DESCRIPTION, GAME_TITLE } from "@/game/content";
import "./globals.css";

export const metadata: Metadata = {
  title: GAME_TITLE,
  description: GAME_DESCRIPTION,
  applicationName: GAME_TITLE,
  openGraph: {
    title: GAME_TITLE,
    description: GAME_DESCRIPTION,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: GAME_TITLE,
    description: GAME_DESCRIPTION,
  },
  appleWebApp: {
    capable: true,
    title: GAME_TITLE,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1c3144",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
