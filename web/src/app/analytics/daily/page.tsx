"use client";

/**
 * Günlük Analiz — gün içi tüm grafikler (skor, flight time, backspace, aktif).
 * Üç durum: giriş yok (demo), giriş var/veri yok (boş), gerçek veri (live).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import {
  ScoreAreaChart,
  FlightTimeChart,
  BackspaceChart,
  ActiveTypingChart,
} from "@/components/Charts";
import { demoDailyData, type HourPoint } from "@/lib/demo-data";
import { getSupabaseBrowser } from "@/lib/supabase/client";

type Mode = "loading" | "demo" | "empty" | "live";

export default function DailyAnalyticsPage() {
  const [data, setData] = useState<HourPoint[]>(demoDailyData());
  const [mode, setMode] = useState<Mode>("loading");

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        setMode("demo");
        return;
      }
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        setMode("demo");
        return;
      }

      const since = new Date();
      since.setHours(0, 0, 0, 0);

      const { data: reports } = await supabase
        .from("analysis_reports")
        .select("score, status, created_at")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true });

      const { data: windows } = await supabase
        .from("typing_windows")
        .select(
          "mean_flight_ms, backspace_percentage, active_typing_seconds, created_at"
        )
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true });

      if (!windows?.length) {
        setMode("empty");
        return;
      }

      const byHour = new Map<string, HourPoint>();
      windows.forEach((w, i) => {
        const r = reports?.[Math.min(i, (reports?.length ?? 1) - 1)];
        const hour =
          new Date(w.created_at).getHours().toString().padStart(2, "0") + ":00";
        byHour.set(hour, {
          hour,
          score: r?.score ?? 0,
          status: r?.status ?? "INSUFFICIENT_DATA",
          mean_flight_ms: w.mean_flight_ms ?? 0,
          backspace_percentage: w.backspace_percentage ?? 0,
          active_typing_seconds: w.active_typing_seconds ?? 0,
        });
      });

      setData(Array.from(byHour.values()));
      setMode("live");
    }
    load().catch(() => setMode("demo"));
  }, []);

  if (mode === "empty") {
    return (
      <AppShell requireConsent>
        <div className="mx-auto max-w-3xl">
          <div className="ns-hero-card text-center">
            <div className="relative">
              <p className="ns-kicker">Günlük analiz</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                Bugün için henüz grafik yok
              </h1>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Eklenti açıkken yazmaya başladığınızda skor, ritim, düzeltme ve
                aktif yazma grafikleri burada oluşur.
              </p>
              <button
                onClick={() => location.reload()}
                className="ns-button-primary mt-6"
              >
                Yenile
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const scored = data.filter((p) => p.score > 0);
  const avgScore = scored.length
    ? Math.round(scored.reduce((sum, p) => sum + p.score, 0) / scored.length)
    : 0;
  const avgBackspace =
    Math.round(
      (data.reduce((sum, p) => sum + p.backspace_percentage, 0) / data.length) *
        10
    ) / 10;
  const activeMinutes = Math.round(
    data.reduce((sum, p) => sum + p.active_typing_seconds, 0) / 60
  );

  return (
    <AppShell requireConsent>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="ns-kicker">Saatlik ritim haritası</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Günlük Analiz
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Gün içinde skorun, tuş ritmin ve düzeltme yoğunluğun nasıl
              dalgalanıyor?
            </p>
          </div>
          {mode === "demo" && (
            <Link href="/login" className="ns-button-secondary py-2 text-xs">
              Demo verisi — giriş yap →
            </Link>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            label="Ortalama Skor"
            value={avgScore || "—"}
            accent="cyan"
            icon="◎"
            sub="bugünkü gerçek skorlar"
            tone="strong"
          />
          <StatCard
            label="Backspace Ort."
            value={`%${avgBackspace}`}
            accent="red"
            icon="⌫"
            sub="düzeltme yoğunluğu"
          />
          <StatCard
            label="Aktif Yazma"
            value={`${activeMinutes} dk`}
            accent="purple"
            icon="⌁"
            sub={`${data.length} saatlik özet`}
          />
        </div>

        <div className="ns-card">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="text-sm font-black text-slate-900 dark:text-white">
                Nasıl okunur?
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Yükselen flight time veya backspace, odak düşüşü için erken
                sinyal olabilir.
              </p>
            </div>
            <div className="text-xs leading-5 text-slate-500">
              <b className="text-slate-700 dark:text-slate-200">Skor</b> 0-100
              arasıdır ve baseline’a göre sapmayı gösterir.
            </div>
            <div className="text-xs leading-5 text-slate-500">
              <b className="text-slate-700 dark:text-slate-200">Gizlilik</b>{" "}
              grafikte görülen her şey anonim özet metriklerden oluşur.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ScoreAreaChart data={data} />
          <FlightTimeChart data={data} />
          <BackspaceChart data={data} />
          <ActiveTypingChart data={data} />
        </div>
      </div>
    </AppShell>
  );
}
