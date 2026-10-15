import { json, route } from "@/lib/api";

/** GET → the build id this deployment serves. Open tabs compare it with their own to offer a reload. */
export const GET = route(async () => json({ version: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" }));
