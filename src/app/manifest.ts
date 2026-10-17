import type { MetadataRoute } from "next";
import { BRAND_BG, ICONS } from "@/lib/pwa-assets";

/** Web app manifest (served at /manifest.webmanifest and linked automatically). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "AVAL",
    short_name: "AVAL",
    description: "Fast, private messaging.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    // The OS splash (Android) is this colour with the icon: the same as the in-app splash.
    background_color: BRAND_BG,
    theme_color: BRAND_BG,
    categories: ["social", "communication"],
    icons: [
      { src: ICONS.any192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: ICONS.any512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: ICONS.maskable512, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Contacts", url: "/contacts", icons: [{ src: ICONS.any192, sizes: "192x192" }] },
      { name: "Starred messages", short_name: "Starred", url: "/saved", icons: [{ src: ICONS.any192, sizes: "192x192" }] },
    ],
  };
}
