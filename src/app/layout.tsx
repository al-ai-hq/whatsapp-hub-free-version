import "./globals.css";
import "./design-system.css";
import "./components.css";
import "./states.css";
import { Inter, Cairo, Schibsted_Grotesk } from "next/font/google";

// Self-hosted at build time — no render-blocking Google Fonts request, no FOUT.
// Each exposes a CSS variable consumed by globals.css (--font-inter etc.).
const inter = Inter({
  subsets: ["latin"], weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter", display: "swap",
});
const cairo = Cairo({
  subsets: ["arabic", "latin"], weight: ["400", "600", "700", "800"],
  variable: "--font-cairo", display: "swap",
});
const schibsted = Schibsted_Grotesk({
  subsets: ["latin"], weight: ["500", "600", "700", "800", "900"],
  variable: "--font-schibsted", display: "swap",
});
const fontVars = `${inter.variable} ${cairo.variable} ${schibsted.variable}`;

export const metadata = {
  title: "WhatsApp Hub Free",
  description: "WhatsApp Hub Free — WhatsApp messaging on Meta's Cloud API",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // suppressHydrationWarning on <html>: the pre-paint theme script sets
  // data-theme, which intentionally differs from the server markup.
  return (
    <html lang="en" className={fontVars} suppressHydrationWarning>
      <head>
        {/* Apply saved theme (global) + saved language (landing only) before
            paint to avoid a flash. Dark + English are the defaults. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var d=document.documentElement;" +
              "if(localStorage.getItem('bc-theme')==='light')d.dataset.theme='light';" +
              "if(location.pathname==='/'&&localStorage.getItem('bc-lang')==='ar'){d.lang='ar';d.dir='rtl';}" +
              "}catch(e){}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
