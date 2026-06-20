"use client";

/**
 * Uygulama kabuğu — kenar çubuğu navigasyonu + tema değiştirici.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ConsentGate } from "./ConsentGate";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "◌" },
  { href: "/analytics/daily", label: "Günlük Analiz", icon: "⌁" },
  { href: "/analytics/weekly", label: "Haftalık Trend", icon: "↗" },
  { href: "/settings", label: "Ayarlar", icon: "⚙" },
  { href: "/privacy", label: "Gizlilik", icon: "◇" },
];

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("ns-theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <button
      onClick={toggle}
      className="ns-focus-ring inline-flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:border-cyan-400/40 dark:hover:bg-cyan-400/10"
      aria-label="Tema değiştir"
    >
      <span aria-hidden>{dark ? "☀" : "◐"}</span>
      <span>{dark ? "Açık" : "Koyu"}</span>
    </button>
  );
}

export function AppShell({
  children,
  requireConsent = false,
}: {
  children: React.ReactNode;
  requireConsent?: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden lg:flex-row">
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-80">
        <div className="absolute left-[-10rem] top-24 h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-400/10" />
        <div className="absolute right-[-8rem] top-[-8rem] h-96 w-96 rounded-full bg-indigo-400/20 blur-3xl dark:bg-indigo-500/10" />
      </div>

      <aside className="border-b border-white/70 bg-white/[0.76] p-4 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/[0.64] lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r lg:p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link href="/dashboard" className="group flex items-center gap-3">
            <div className="relative h-10 w-10 overflow-hidden rounded-2xl border border-cyan-300/50 bg-slate-950 shadow-lg shadow-cyan-500/15 dark:border-cyan-300/25">
              <div className="absolute inset-1 rounded-xl bg-[radial-gradient(circle_at_35%_30%,#67e8f9,transparent_35%),radial-gradient(circle_at_70%_70%,#818cf8,transparent_40%)]" />
              <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_42%,rgba(255,255,255,0.36)_43%,transparent_44%)]" />
            </div>
            <div>
              <span className="block text-lg font-black leading-none tracking-tight ns-gradient-text">
                NeuroSpace
              </span>
              <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                private focus lab
              </span>
            </div>
          </Link>
          <div className="lg:hidden">
            <ThemeToggle />
          </div>
        </div>

        <div className="mb-5 hidden rounded-3xl border border-cyan-200/70 bg-cyan-50/70 p-4 text-xs leading-relaxed text-slate-600 dark:border-cyan-300/15 dark:bg-cyan-300/[0.06] dark:text-slate-300 lg:block">
          <div className="mb-2 font-bold text-cyan-700 dark:text-cyan-200">
            İçerik değil ritim ölçülür.
          </div>
          Karakter, kelime veya metin saklanmadan yalnızca anonim yazma
          metrikleri analiz edilir.
        </div>

        <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`ns-focus-ring group relative inline-flex whitespace-nowrap rounded-2xl px-3 py-2.5 text-sm font-semibold transition lg:w-full ${
                  active
                    ? "bg-slate-950 text-white shadow-lg shadow-slate-950/15 dark:bg-white dark:text-slate-950"
                    : "text-slate-600 hover:bg-white/80 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
                }`}
              >
                <span
                  className="mr-2 inline-flex w-5 justify-center opacity-80"
                  aria-hidden
                >
                  {item.icon}
                </span>
                {item.label}
                {active && (
                  <span
                    className="ml-auto hidden text-cyan-300 dark:text-cyan-600 lg:inline"
                    aria-hidden
                  >
                    ●
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 hidden lg:block">
          <ThemeToggle />
        </div>

        <div className="absolute bottom-5 left-5 right-5 hidden text-[11px] text-slate-400 lg:block">
          <div className="mb-2 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent dark:via-white/10" />
          KVKK/GDPR odaklı demo panel · v0.1
        </div>
      </aside>

      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        {requireConsent ? <ConsentGate>{children}</ConsentGate> : children}
      </main>
    </div>
  );
}
