import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";


const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Study OS", template: "%s · Study OS" },
  description: "A personal study operating system for Thanaweya Amma: plan, focus, revise and track.",
  applicationName: "Study OS",
  appleWebApp: { capable: true, title: "Study OS", statusBarStyle: "black-translucent" },
  icons: { apple: "/pwa-icon/192" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Applies theme, language direction, density and motion preferences before
 * first paint (mirrored to localStorage by the data store) to avoid flashes.
 */
const prePaint = `(function(){try{var p=JSON.parse(localStorage.getItem('sos-prefs')||'{}');var d=document.documentElement;var t=p.theme||'dark';var dark=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);d.classList.toggle('dark',dark);var l=p.lang||'en';d.lang=l;d.dir=l==='ar'?'rtl':'ltr';d.dataset.density=p.density||'comfortable';if(p.reducedMotion||p.animations===false)d.dataset.motion='reduced';}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr" className={cn("dark", inter.variable, arabic.variable, "font-sans")} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: prePaint }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
