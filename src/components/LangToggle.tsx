"use client";

import { useEffect, useState } from "react";

// EN is the default. Arabic sets <html lang="ar" dir="rtl"> (Cairo font + RTL via
// the design system's logical properties). Persisted in localStorage and applied
// pre-paint by the inline script in layout.tsx — but only on the landing ("/"),
// so the rest of the app isn't forced into RTL.
export default function LangToggle() {
  const [ar, setAr] = useState(false);

  useEffect(() => {
    setAr(document.documentElement.lang === "ar");
  }, []);

  function toggle() {
    const next = !ar;
    setAr(next);
    const root = document.documentElement;
    root.lang = next ? "ar" : "en";
    root.dir = next ? "rtl" : "ltr";
    try { localStorage.setItem("bc-lang", next ? "ar" : "en"); } catch { /* ignore */ }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={ar ? "التبديل إلى الإنجليزية" : "Switch to Arabic"}
      title={ar ? "English" : "العربية"}
      style={{ fontFamily: "var(--font)", fontWeight: 700, fontSize: 13 }}
    >
      {ar ? "EN" : "ع"}
    </button>
  );
}
