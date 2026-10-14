"use client";

import { useEffect, useState } from "react";

interface Me {
  email: string;
}

let cached: Me | null = null;
let promise: Promise<Me> | null = null;

export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(cached);
  useEffect(() => {
    if (cached) { setMe(cached); return; }
    if (!promise) {
      promise = fetch("/api/auth/me").then((r) => r.json()).then((d) => { cached = d; return d; });
    }
    promise.then(setMe);
  }, []);
  return me;
}
