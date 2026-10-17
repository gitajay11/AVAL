import type { MetadataRoute } from "next";

/** Web app manifest (served at /manifest.webmanifest and linked automatically). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "AVAL",
    short_name: "AVAL",
    description: "Fast, private messaging.",
    start_url: "/chats",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#07141a",
    theme_color: "#07141a",
    categories: ["social", "communication"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Contacts", url: "/contacts", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Starred messages", short_name: "Starred", url: "/saved", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
