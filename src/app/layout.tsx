import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Backdrop } from "@/components/app/backdrop";
import { Providers } from "@/components/providers";
import "./globals.css";
import { installScript, launchScript, themeScript } from "@/lib/inline-scripts";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Aval", template: "%s · Aval" },
  description: "Fast, private messaging.",
  applicationName: "Aval",
  appleWebApp: { capable: true, title: "Aval", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#07141a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={jakarta.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript + launchScript + installScript }} />
      </head>
      <body className="min-h-dvh">
        {/* Launch screen: shown by launchScript when the app starts, gone by CSS
            after a moment (it never blocks taps and can't get stuck). */}
        <div className="launch-screen" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand image, shown before anything else loads */}
          <img src="/icons/logo-256.webp" srcSet="/icons/logo-256.webp 256w, /icons/logo-512.webp 512w" sizes="128px" alt="" width={128} height={128} className="launch-logo" />
          <span className="launch-name">AVAL</span>
        </div>
        <Backdrop />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
