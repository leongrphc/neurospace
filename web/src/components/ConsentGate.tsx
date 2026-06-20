"use client";

/**
 * ConsentGate — Giriş yapmış ancak açık rıza vermemiş kullanıcıya, korumalı
 * içeriği göstermeden önce KVKK/GDPR açık rıza ekranı sunar.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase/client";

type State = "checking" | "ok" | "needsConsent";

const CONSENT_POINTS = [
  {
    mark: "✓",
    title: "Yalnızca anonim ritim",
    text: "Tuşlar arası süre, backspace oranı ve duraklama gibi sayısal özetler işlenir.",
    cls: "text-emerald-500",
  },
  {
    mark: "✕",
    title: "İçerik yok",
    text: "Karakter, kelime veya metin kaydedilmez; şifre ve ödeme alanlarında ölçüm yapılmaz.",
    cls: "text-rose-500",
  },
  {
    mark: "!",
    title: "Farkındalık aracı",
    text: "NeuroSpace tıbbi/teşhis aracı değildir; odak ve mola farkındalığı sağlar.",
    cls: "text-amber-500",
  },
];

export function ConsentGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);

  async function check() {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setState("ok");
      return;
    }
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      setState("ok");
      return;
    }
    try {
      const res = await fetch("/api/account/consent", {
        headers: { Authorization: `Bearer ${session.session.access_token}` },
      });
      const json = await res.json();
      setState(json.needsConsent ? "needsConsent" : "ok");
    } catch {
      setState("ok");
    }
  }

  useEffect(() => {
    check();
  }, []);

  async function grant() {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return;

    setBusy(true);
    try {
      await fetch("/api/account/consent", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ granted: true }),
      });
      setState("ok");
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="ns-card inline-flex items-center gap-3 text-sm font-semibold text-slate-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
          Rıza durumu kontrol ediliyor...
        </div>
      </div>
    );
  }

  if (state === "needsConsent") {
    return (
      <div className="mx-auto max-w-3xl py-6">
        <div className="ns-hero-card">
          <div className="relative">
            <div className="ns-kicker">KVKK/GDPR açık rıza</div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
              Başlamadan önce verinin sınırlarını netleştirelim.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              NeuroSpace, yazdığınız şeyi değil yazma ritminizin sayısal izini
              analiz eder. Devam etmek için aşağıdaki koşulları onaylamanız
              gerekir.
            </p>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {CONSENT_POINTS.map((item) => (
                <div key={item.title} className="ns-panel-muted">
                  <div className={`text-2xl font-black ${item.cls}`}>
                    {item.mark}
                  </div>
                  <div className="mt-2 text-sm font-bold text-slate-900 dark:text-white">
                    {item.title}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-5 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Ayrıntılar için{" "}
              <Link
                href="/privacy"
                className="font-semibold text-cyan-600 underline dark:text-cyan-300"
              >
                Gizlilik ve Aydınlatma Metni
              </Link>
              . Rızanızı Ayarlar sayfasından geri çekebilir, verilerinizi
              indirebilir veya silebilirsiniz.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={grant}
                disabled={busy}
                className="ns-button-primary"
              >
                {busy ? "Kaydediliyor..." : "Açık rıza veriyorum, devam et"}
              </button>
              <Link href="/privacy" className="ns-button-secondary">
                Önce metni oku
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
