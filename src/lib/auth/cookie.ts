// Edge-safe (used by proxy.ts): no Node or database imports here.

const isProd = process.env.NODE_ENV === "production";

/** `__Host-` pins the cookie to this exact origin over HTTPS, with Path=/ and no Domain. */
export const SESSION_COOKIE = isProd ? "__Host-aval.sid" : "aval.sid";

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days, sliding

export const sessionCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax" as const, // Lax so links from email/push open signed in
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};

/** UI-only theme preference. Not user data, so a JS-readable cookie is fine. */
export const THEME_COOKIE = "aval-theme";
