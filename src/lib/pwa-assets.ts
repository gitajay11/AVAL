// Icon and launch-image files, all generated from public/logo/aval-logo-circle.png
// by `pnpm icons` (scripts/icons.mts) and referenced by the manifest, the page
// head and the service worker. The version is in the file names: installed apps
// and phones cache icons by URL, so new artwork must live at new URLs.
export const ICON_VERSION = "v3";

/** The brand background behind the logo wherever an image can't be transparent. */
export const BRAND_BG = "#07141A";

export const ICONS = {
  any192: `/icons/icon-192.${ICON_VERSION}.png`,
  any512: `/icons/icon-512.${ICON_VERSION}.png`,
  maskable512: `/icons/icon-maskable-512.${ICON_VERSION}.png`,
  appleTouch: `/icons/apple-touch-icon.${ICON_VERSION}.png`,
  favicon32: `/icons/favicon-32.${ICON_VERSION}.png`,
  favicon: `/favicon.ico?${ICON_VERSION}`,
  badge: `/icons/badge-72.${ICON_VERSION}.png`,
} as const;

/** iOS launch screens (apple-touch-startup-image): portrait, CSS size × pixel ratio. */
export const STARTUP_DEVICES: { width: number; height: number; ratio: number }[] = [
  { width: 440, height: 956, ratio: 3 }, // iPhone 16 Pro Max
  { width: 402, height: 874, ratio: 3 }, // iPhone 16 Pro
  { width: 430, height: 932, ratio: 3 }, // iPhone 14/15 Pro Max, 15/16 Plus
  { width: 393, height: 852, ratio: 3 }, // iPhone 14/15 Pro, 15, 16
  { width: 428, height: 926, ratio: 3 }, // iPhone 12/13 Pro Max, 14 Plus
  { width: 390, height: 844, ratio: 3 }, // iPhone 12/13/14, 12/13 Pro
  { width: 375, height: 812, ratio: 3 }, // iPhone X/XS/11 Pro, 12/13 mini
  { width: 414, height: 896, ratio: 3 }, // iPhone XS Max, 11 Pro Max
  { width: 414, height: 896, ratio: 2 }, // iPhone XR, 11
  { width: 414, height: 736, ratio: 3 }, // iPhone 6/7/8 Plus
  { width: 375, height: 667, ratio: 2 }, // iPhone 6/7/8, SE (2nd/3rd)
  { width: 320, height: 568, ratio: 2 }, // iPhone SE (1st)
];

export const startupImage = (d: { width: number; height: number; ratio: number }) => ({
  url: `/splash/apple-splash-${d.width * d.ratio}x${d.height * d.ratio}.${ICON_VERSION}.png`,
  media: `screen and (device-width: ${d.width}px) and (device-height: ${d.height}px) and (-webkit-device-pixel-ratio: ${d.ratio}) and (orientation: portrait)`,
});

/** The logo's on-screen size in the launch screens (CSS px), so OS and in-app splash line up. */
export const SPLASH_LOGO = 120;
