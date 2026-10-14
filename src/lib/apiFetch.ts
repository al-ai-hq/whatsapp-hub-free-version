"use client";

// Client fetch wrapper with one-shot silent refresh.
// Belt-and-suspenders alongside the server-side refresh in middleware:
// if a client request still gets 401 (e.g. both cookies rotated mid-flight),
// hit /api/auth/refresh once and retry. On final 401, bounce to /login.
let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  // De-dupe concurrent refreshes so we only call the endpoint once.
  refreshing ??= fetch("/api/auth/refresh", { method: "POST" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let res = await fetch(input, init);
  if (res.status !== 401) return res;

  const ok = await tryRefresh();
  if (!ok) {
    if (typeof window !== "undefined") {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    return res;
  }
  res = await fetch(input, init); // retry once with the new cookie
  return res;
}
