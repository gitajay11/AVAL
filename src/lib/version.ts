/** The app version from package.json (set at build time by next.config.ts). */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

/** "AVAL 1.0": major.minor, as shown in Settings and on the sign-in screens. */
export const APP_LABEL = `AVAL ${APP_VERSION.split(".").slice(0, 2).join(".")}`;
