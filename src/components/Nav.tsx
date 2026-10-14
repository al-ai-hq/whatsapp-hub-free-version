"use client";

import { useState } from "react";
import Link from "next/link";
import LogoutButton from "./LogoutButton";

const LINKS: readonly (readonly [string, string])[] = [
  ["/dashboard", "Dashboard"],
  ["/inbox", "Inbox"],
  ["/contacts", "Contacts"],
  ["/lists", "Lists"],
  ["/templates", "Templates"],
  ["/campaigns", "Campaigns"],
  ["/settings", "Settings"],
];

/** Brand wordmark + primary nav. Collapses into a disclosure menu on mobile. */
export default function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <nav className="nav">
      <Link href="/dashboard" className="brand" aria-label="WhatsApp Hub Free home" onClick={() => setOpen(false)}>
        <span className="mark" aria-hidden />
        <span><span className="b1">whatsapp</span><span className="b2">hub</span></span>
      </Link>
      <button
        type="button"
        className="nav__toggle"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls="nav-links"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>{open ? "✕" : "☰"}</span>
      </button>
      <div id="nav-links" className={`nav__links${open ? " nav__links--open" : ""}`}>
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>
        ))}
        <Link href="/settings#my-account" data-test-id="nav-change-password" onClick={() => setOpen(false)}>
          Change password
        </Link>
        <LogoutButton />
      </div>
    </nav>
  );
}
