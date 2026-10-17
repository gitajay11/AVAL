import { THEME_COOKIE } from "@/lib/auth/cookie";

// Scripts inlined in <head> by the root layout. They live here, not in the
// "use client" modules that use their results: a server component importing a
// value from a client module gets a client reference (a function), not the
// string, and that would be stringified into the page instead of the script.

/**
 * Runs before first paint: resolves the saved preference (a UI-only cookie) or
 * the OS setting into data-theme, so there's no flash. (components/theme.tsx)
 */
export const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark|system)/);var p=m?m[1]:"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.dataset.theme=d?"dark":"light";r.dataset.themePref=p;}catch(e){}})();`;

/**
 * Before first paint: show the launch screen (app/layout.tsx) when the app
 * starts — every launch of the installed app, and once per browser-tab session
 * (a UI-only flag in sessionStorage; no user data).
 */
export const launchScript = `(function(){try{var a=matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;if(a||!sessionStorage.getItem("aval-launched")){document.documentElement.classList.add("launch");sessionStorage.setItem("aval-launched","1");}}catch(e){}})();`;

/** Keeps Chrome's own mini-infobar away and holds the event for our UI. (components/app/pwa.tsx) */
export const installScript = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__avalInstall=e;});`;
