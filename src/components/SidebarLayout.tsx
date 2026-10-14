"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import LangToggle from "@/components/LangToggle";
import LogoutButton from "@/components/LogoutButton";

const NAV_ITEMS = [
  { href: "/dashboard", label: { en: "Dashboard", ar: "\u0644\u0648\u062D\u0629 \u0627\u0644\u062A\u062D\u0643\u0645" }, icon: "\u{1F3E0}" },
  { href: "/contacts", label: { en: "Contacts", ar: "\u062C\u0648\u0627\u0632 \u0627\u0644\u0639\u0646\u0627\u0648\u064A\u0646" }, icon: "\u{1F465}" },
  { href: "/lists", label: { en: "Lists", ar: "\u0627\u0644\u0642\u0648\u0627\u0626\u0645" }, icon: "\u{1F4CB}" },
  { href: "/templates", label: { en: "Templates", ar: "\u0627\u0644\u0642\u0648\u0627\u0644\u0628" }, icon: "\u{1F4DD}" },
  { href: "/campaigns", label: { en: "Campaigns", ar: "\u0627\u0644\u062D\u0645\u0644\u0627\u062A" }, icon: "\u{1F501}" },
  { href: "/inbox", label: { en: "Inbox", ar: "\u0627\u0644\u0635\u0646\u062F\u0648\u0642" }, icon: "\u{1F4E5}" },
  { href: "/settings", label: { en: "Settings", ar: "\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A" }, icon: "\u2699\uFE0F" },
];

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand" aria-label="WhatsApp Hub Free">
          <span className="mark" aria-hidden />
          <span><span className="b1">whatsapp</span><span className="b2">hub</span></span>
        </Link>
        <nav className="sidebar__nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar__link${pathname === item.href || pathname?.startsWith(item.href + "/") ? " is-active" : ""}`}
            >
              <span className="sidebar__icon" aria-hidden>{item.icon}</span>
              <span data-lang="en">{item.label.en}</span>
              <span data-lang="ar">{item.label.ar}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar__footer">
          <div className="row" style={{ gap: 8 }}>
            <LangToggle />
            <ThemeToggle />
          </div>
          <LogoutButton />
        </div>
      </aside>
      <main className="sidebar__main">{children}</main>
    </div>
  );
}
