"use client";

import { useEffect, useState } from "react";

// Dark is the default (no attribute). Light is opt-in, persisted in localStorage
// and applied pre-paint by the inline script in layout.tsx.
export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.dataset.theme === "light");
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    const root = document.documentElement;
    if (next) root.dataset.theme = "light";
    else delete root.dataset.theme;
    try { localStorage.setItem("bc-theme", next ? "light" : "dark"); } catch { /* ignore */ }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-pressed={light}
      aria-label={light ? "Switch to dark theme" : "Switch to light theme"}
      title={light ? "Dark mode" : "Light mode"}
    >
      {light ? "☾" : "☀"}
    </button>
  );
}
