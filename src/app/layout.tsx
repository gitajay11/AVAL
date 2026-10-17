import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Backdrop } from "@/components/app/backdrop";
import { Providers } from "@/components/providers";
import "./globals.css";
import { installScript, themeScript } from "@/lib/inline-scripts";
import { ICONS, STARTUP_DEVICES, startupImage } from "@/lib/pwa-assets";
import { APP_LABEL } from "@/lib/version";
import { LaunchSplash } from "@/components/app/launch-splash";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Aval", template: "%s · Aval" },
  description: "Fast, private messaging.",
  applicationName: "Aval",
  // The only icon links (Next's app/icon*, apple-icon* and favicon.ico files are
  // gone, so it adds none of its own). Versioned URLs: phones cache icons by URL.
  icons: {
    icon: [
      { url: ICONS.favicon, sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: ICONS.favicon32, sizes: "32x32", type: "image/png" },
      { url: ICONS.any192, sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: ICONS.appleTouch, sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "AVAL",
    statusBarStyle: "black-translucent",
    // iOS launch screens: the logo centred on the brand background.
    startupImage: STARTUP_DEVICES.map(startupImage),
  },
  // Next writes only mobile-web-app-capable; iOS reads launch screens with the Apple name.
  other: { "apple-mobile-web-app-capable": "yes" },
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
        <script dangerouslySetInnerHTML={{ __html: themeScript + installScript }} />
      </head>
      <body className="min-h-dvh">
        {/* Launch splash: in the first HTML (so it covers everything from the first
            frame), dismissed by <LaunchSplash> once the app is ready. */}
        <div id="aval-splash" className="splash" aria-hidden="true">
          <span className="splash-glow" />
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand image, shown before anything else loads */}
          <img src="/icons/logo-256.webp" srcSet="/icons/logo-256.webp 256w, /icons/logo-512.webp 512w" sizes="120px" alt="" width={120} height={120} className="splash-logo" />
          <span className="splash-version">{APP_LABEL}</span>
        </div>
        <LaunchSplash />
        <Backdrop />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
