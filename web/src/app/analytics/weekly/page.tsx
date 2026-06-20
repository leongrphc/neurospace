"use client";

/**
 * Haftalık Trend — son 7 günün skor ve aktif yazma süresi.
 * Üç durum: giriş yok (demo), giriş var/veri yok (boş), gerçek veri (live).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { WeeklyScoreChart, WeeklyActiveChart } from "@/components/Charts";
import { StatCard } from "@/components/StatCard";
import { demoWeeklyData, type DayPoint } from "@/lib/demo-data";
import { getSupabaseBrowser } from "@/lib/supabase/client";

type Mode = "loading" | "demo" | "empty" | "live";

const DAY_LABELS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

export default function WeeklyAnalyticsPage() {
  const [data, setData] = useState<DayPoint[]>(demoWeeklyData());
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
      since.setDate(since.getDate() - 6);
      since.setHours(0, 0, 0, 0);

      const { data: reports } = await supabase
        .from("analysis_reports")
        .select("score, created_at")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true });

      const { data: windows } = await supabase
        .from("typing_windows")
        .select("active_typing_seconds, created_at")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true });

      if (!windows?.length) {
        setMode("empty");
        return;
      }

      const buckets: { label: string; scores: number[]; seconds: number }[] = [];
      const keyToIdx = new Map<string, number>();
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        keyToIdx.set(key, buckets.length);
        buckets.push({ label: DAY_LABELS[d.getDay()], scores: [], seconds: 0 });
      }

      (reports ?? []).forEach((r) => {
        const key = new Date(r.created_at).toISOString().slice(0, 10);
        const idx = keyToIdx.get(key);
        if (idx !== undefined && (r.score ?? 0) > 0) buckets[idx].scores.push(r.score);
      });
      windows.forEach((w) => {
        const key = new Date(w.created_at).toISOString().slice(0, 10);
        const idx = keyToIdx.get(key);
        if (idx !== undefined) buckets[idx].seconds += w.active_typing_seconds ?? 0;
      });

      setData(
        buckets.map((b) => ({
          day: b.label,
          avgScore: b.scores.length
            ? Math.round(b.scores.reduce((s, v) => s + v, 0) / b.scores.length)
            : 0,
          activeMinutes: Math.round(b.seconds / 60),
        }))
      );
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
              <p className="ns-kicker">Haftalık trend</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                Haftalık desen için biraz daha veri gerekiyor
              </h1>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Birkaç gün kullanım sonrası skor ve aktif yazma yoğunluğu haftalık
                bağlamda burada görünür.
              </p>
              <button onClick={() => location.reload()} className="ns-button-primary mt-6">
                Yenile
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const scored = data.filter((d) => d.avgScore > 0);
  const weeklyAverage = scored.length
    ? Math.round(scored.reduce((sum, d) => sum + d.avgScore, 0) / scored.length)
    : 0;
  const totalActive = data.reduce((sum, d) => sum + d.activeMinutes, 0);
  const mostActive = data.reduce((a, b) => (b.activeMinutes > a.activeMinutes ? b : a), data[0]);
  const firstScore = scored[0]?.avgScore ?? 0;
  const lastScore = scored[scored.length - 1]?.avgScore ?? 0;
  const delta = lastScore && firstScore ? lastScore - firstScore : 0;

  return (
    <AppShell requireConsent>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="ns-kicker">7 günlük odak deseni</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Haftalık Trend
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Günlük dalgalanmaların ötesine bak: hangi günler daha stabil, hangi günler daha yoğun?
            </p>
          </div>
          {mode === "demo" && (
            <Link href="/login" className="ns-button-secondary py-2 text-xs">
              Demo verisi — giriş yap →
            </Link>
          )}
        </div>

        <section className="ns-hero-card">
          <div className="relative grid gap-5 md:grid-cols-[0.9fr_1.1fr] md:items-center">
            <div>
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Haftalık ortalama</p>
              <div className="mt-2 text-7xl font-black leading-none tracking-tighter text-slate-950 dark:text-white">
                {weeklyAverage || "—"}
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {delta > 0
                  ? `Hafta başına göre ${delta} puanlık toparlanma görünüyor.`
                  : delta < 0
                  ? `Hafta başına göre ${Math.abs(delta)} puanlık düşüş var; mola ritmini gözden geçir.`
                  : "Haftalık skor çizgisi dengeli görünüyor."}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="ns-panel-muted">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Aktif toplam</div>
                <div className="mt-2 text-2xl font-black">{totalActive} dk</div>
              </div>
              <div className="ns-panel-muted">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">En aktif gün</div>
                <div className="mt-2 text-2xl font-black">{mostActive.day}</div>
              </div>
              <div className="ns-panel-muted">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Skor farkı</div>
                <div className="mt-2 text-2xl font-black">{delta > 0 ? "+" : ""}{delta}</div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Haftalık Ortalama" value={weeklyAverage || "—"} accent="cyan" icon="◎" tone="strong" />
          <StatCard label="Toplam Aktif Yazma" value={`${totalActive} dk`} accent="purple" icon="⌁" />
          <StatCard label="En Aktif Gün" value={mostActive.day} accent="green" icon="↟" sub={`${mostActive.activeMinutes} dk`} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <WeeklyScoreChart data={data} />
          <WeeklyActiveChart data={data} />
        </div>
      </div>
    </AppShell>
  );
}
