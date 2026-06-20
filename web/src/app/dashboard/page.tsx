"use client";

/**
 * Ana Dashboard — kart tabanlı özet + gün içi grafikler.
 * Üç durum: (1) giriş yok, (2) giriş var/veri yok, (3) gerçek veri.
 * Yalnızca giriş yapılmamış ya da Supabase yapılandırılmamışsa demo gösterilir.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StatCard, StatusBadge, TrendBadge } from "@/components/StatCard";
import { ScoreAreaChart, FlightTimeChart } from "@/components/Charts";
import { demoDailyData, demoSummary, type HourPoint } from "@/lib/demo-data";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import {
  detectTrend,
  type AnalysisStatus,
  type TrendDirection,
} from "@/lib/analysis-engine";

type Mode = "loading" | "demo" | "empty" | "live";

const STATUS_COPY: Record<AnalysisStatus, string> = {
  INSUFFICIENT_DATA:
    "Kalibrasyon sürüyor. Birkaç pencere daha yazma ritmi toplandığında skor netleşir.",
  OPTIMAL:
    "Ritmin dengeli görünüyor. Derin çalışma blokları için iyi bir aralıktasın.",
  SLIGHTLY_DISTRACTED:
    "Hafif dalgalanma var. Bildirimleri kapatıp tek işe dönmek iyi gelebilir.",
  WARNING:
    "Odak düşüşü sinyali var. Kısa bir mola veya görev değiştirme planla.",
  FATIGUED:
    "Belirgin yorgunluk sinyali var. Su, hareket ve ekran molası önerilir.",
  RECOVERING:
    "Toparlanma sinyali var. Hafif görevlerle tempoyu kademeli artır.",
};

function ModeBadge({ mode }: { mode: Mode }) {
  const label =
    mode === "live"
      ? "Canlı veri"
      : mode === "loading"
        ? "Yükleniyor"
        : "Demo veri";
  const cls =
    mode === "live"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
      : mode === "loading"
        ? "bg-slate-500/10 text-slate-500"
        : "bg-amber-500/10 text-amber-700 dark:text-amber-200";
  return (
    <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${cls}`}>
      {label}
    </span>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState(demoSummary());
  const [daily, setDaily] = useState<HourPoint[]>(demoDailyData());
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
        .select("score, status, created_at, recommendation")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true });

      const { data: windows } = await supabase
        .from("typing_windows")
        .select(
          "mean_flight_ms, backspace_percentage, active_typing_seconds, created_at"
        )
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true });

      if (!reports?.length || !windows?.length) {
        setMode("empty");
        return;
      }

      const byHour = new Map<
        string,
        {
          scoreSum: number;
          scoreCount: number;
          flightSum: number;
          backspaceSum: number;
          activeSeconds: number;
          windowCount: number;
          lastStatus: HourPoint["status"];
        }
      >();

      reports.forEach((r, i) => {
        const w = windows[Math.min(i, windows.length - 1)];
        const hour =
          new Date(r.created_at).getHours().toString().padStart(2, "0") + ":00";
        const prev = byHour.get(hour) ?? {
          scoreSum: 0,
          scoreCount: 0,
          flightSum: 0,
          backspaceSum: 0,
          activeSeconds: 0,
          windowCount: 0,
          lastStatus: "INSUFFICIENT_DATA" as HourPoint["status"],
        };
        const score = r.score ?? 0;
        byHour.set(hour, {
          scoreSum: prev.scoreSum + score,
          scoreCount: prev.scoreCount + (score > 0 ? 1 : 0),
          flightSum: prev.flightSum + (w?.mean_flight_ms ?? 0),
          backspaceSum: prev.backspaceSum + (w?.backspace_percentage ?? 0),
          activeSeconds: prev.activeSeconds + (w?.active_typing_seconds ?? 0),
          windowCount: prev.windowCount + 1,
          lastStatus: r.status,
        });
      });

      const points = Array.from(byHour.entries()).map(([hour, bucket]) => ({
        hour,
        score: bucket.scoreCount
          ? Math.round(bucket.scoreSum / bucket.scoreCount)
          : 0,
        status: bucket.lastStatus,
        mean_flight_ms: Math.round(bucket.flightSum / bucket.windowCount),
        backspace_percentage:
          Math.round((bucket.backspaceSum / bucket.windowCount) * 10) / 10,
        active_typing_seconds: bucket.activeSeconds,
      }));
      const scored = points.filter((p) => p.score > 0);

      if (!scored.length) {
        setMode("empty");
        return;
      }

      const last = reports[reports.length - 1];
      const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
      const worst = scored.reduce((a, b) => (b.score < a.score ? b : a));

      setDaily(points);
      setSummary({
        currentScore: last.score ?? 0,
        currentStatus: last.status,
        todayAverage: Math.round(
          scored.reduce((s, p) => s + p.score, 0) / scored.length
        ),
        bestHour: best.hour,
        worstHour: worst.hour,
        avgFlightMs: Math.round(
          points.reduce((s, p) => s + p.mean_flight_ms, 0) / points.length
        ),
        backspacePct:
          Math.round(
            (points.reduce((s, p) => s + p.backspace_percentage, 0) /
              points.length) *
              10
          ) / 10,
        activeMinutes: Math.round(
          points.reduce((s, p) => s + p.active_typing_seconds, 0) / 60
        ),
      });
      setMode("live");
    }
    load().catch(() => setMode("demo"));
  }, []);

  if (mode === "empty") {
    return (
      <AppShell requireConsent>
        <div className="mx-auto max-w-4xl">
          <div className="ns-hero-card text-center">
            <div className="relative">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-500/10 text-3xl">
                ⌨
              </div>
              <p className="ns-kicker">Kalibrasyon bekleniyor</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                Henüz bugün için ritim verisi yok
              </h1>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Eklenti yüklü ve takip açıksa, yazmaya başladıktan sonra her 3
                dakikada bir anonim özet buraya düşer. İlk 2 pencere baseline
                kalibrasyonu için kullanılır.
              </p>
              <div className="mt-6 grid gap-3 text-left md:grid-cols-3">
                <div className="ns-panel-muted">
                  <b>1.</b> Eklenti açık mı?
                </div>
                <div className="ns-panel-muted">
                  <b>2.</b> Takip ayarı aktif mi?
                </div>
                <div className="ns-panel-muted">
                  <b>3.</b> 3 dakika yazma ritmi oluştu mu?
                </div>
              </div>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button
                  onClick={() => location.reload()}
                  className="ns-button-primary"
                >
                  Yenile
                </button>
                <Link href="/settings" className="ns-button-secondary">
                  Ayarları kontrol et
                </Link>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const scored = daily.filter((p) => p.score > 0);
  const trend: TrendDirection = detectTrend(
    scored.map((p) => p.score).slice(-6)
  );
  const scoreRange = scored.length
    ? `${Math.min(...scored.map((p) => p.score))}–${Math.max(...scored.map((p) => p.score))}`
    : "—";
  const windowCount = daily.length;
  const signalText = STATUS_COPY[summary.currentStatus];

  return (
    <AppShell requireConsent>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="ns-kicker">Bugünkü bilişsel enerji</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              İçerik saklamadan, yalnızca yazma ritminizden oluşan odak
              görünümü.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ModeBadge mode={mode} />
            {mode === "demo" && (
              <Link href="/login" className="ns-button-secondary py-2 text-xs">
                Gerçek veri için giriş →
              </Link>
            )}
          </div>
        </div>

        <section className="ns-hero-card">
          <div className="relative grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={summary.currentStatus} />
                <TrendBadge trend={trend} />
              </div>
              <div className="mt-6 flex items-end gap-4">
                <div className="text-7xl font-black leading-none tracking-tighter text-slate-950 dark:text-white sm:text-8xl">
                  {summary.currentScore}
                </div>
                <div className="pb-2 text-sm font-semibold text-slate-500">
                  /100
                  <br />
                  güncel skor
                </div>
              </div>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-700 dark:text-slate-200">
                {signalText}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="ns-panel-muted">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  Pencere
                </div>
                <div className="mt-2 text-2xl font-black">{windowCount}</div>
                <div className="text-xs text-slate-500">bugün işlenen özet</div>
              </div>
              <div className="ns-panel-muted">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  Skor aralığı
                </div>
                <div className="mt-2 text-2xl font-black">{scoreRange}</div>
                <div className="text-xs text-slate-500">gün içi dalga boyu</div>
              </div>
              <div className="ns-panel-muted">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  Gizlilik modu
                </div>
                <div className="mt-2 text-2xl font-black">Metin yok</div>
                <div className="text-xs text-slate-500">
                  sadece anonim metrik
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Bugünkü Ortalama"
            value={summary.todayAverage}
            accent="cyan"
            icon="◎"
            sub="0-100 skala"
            tone="strong"
          />
          <StatCard
            label="En Verimli Saat"
            value={summary.bestHour}
            accent="green"
            icon="↟"
          />
          <StatCard
            label="En Düşük Odak"
            value={summary.worstHour}
            accent="amber"
            icon="↡"
          />
          <StatCard
            label="Aktif Yazma"
            value={`${summary.activeMinutes} dk`}
            accent="purple"
            icon="⌁"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard
            label="Ort. Yazma Hızı"
            value={`${summary.avgFlightMs} ms`}
            accent="indigo"
            sub="tuşlar arası ortalama"
            caption="Düşük sapma daha stabil ritim demektir."
          />
          <StatCard
            label="Backspace Oranı"
            value={`%${summary.backspacePct}`}
            accent="red"
            sub="düzeltme yoğunluğu"
            caption="İçerik değil yalnızca düzeltme oranı tutulur."
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ScoreAreaChart data={daily} />
          <FlightTimeChart data={daily} />
        </div>
      </div>
    </AppShell>
  );
}
