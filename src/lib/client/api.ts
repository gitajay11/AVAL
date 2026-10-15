// Browser-side fetch wrapper for our JSON API. Cookies are httpOnly and sent
// automatically; nothing auth-related is ever read or stored in JS.

export class ClientApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export async function api<T = unknown>(
  path: string,
  options: { method?: Method; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const { method = options.body !== undefined ? "POST" : "GET", body, signal } = options;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      signal,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ClientApiError(0, "network", "You appear to be offline. Check your connection.");
  }

  const data = res.headers.get("content-type")?.includes("application/json") ? await res.json() : null;
  if (!res.ok) {
    const e = data?.error;
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
      // Session ended elsewhere (e.g. "log out of all devices"): hard reload drops in-memory state.
      window.location.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
    }
    throw new ClientApiError(res.status, e?.code ?? "error", e?.message ?? "Something went wrong.", e?.fields);
  }
  return data as T;
}

/** Only allow same-site relative paths as post-login destinations. */
export function safeNext(next: string | null | undefined, fallback = "/chats"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
