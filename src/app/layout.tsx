import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "tune — your Telegram music library",
  description: "Save Telegram audio, make playlists, and listen your way.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#11110f",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">{`
          try {
            const saved = localStorage.getItem("tune:theme");
            const fallback = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
            document.documentElement.dataset.theme = saved === "light" || saved === "dark" ? saved : fallback;
          } catch {}
        `}</Script>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
        {children}
      </body>
    </html>
  );
}
