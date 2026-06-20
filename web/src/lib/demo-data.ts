/**
 * Demo veri üreteci — Supabase yapılandırılmadığında veya veri yokken
 * dashboard'un çalışır halde görünmesini sağlar.
 * Deterministik (seed'li) üretim: her yenilemede aynı grafikler.
 */

import type { AnalysisStatus } from "./analysis-engine";

// Basit seed'li PRNG (mulberry32)
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface HourPoint {
  hour: string; // "09:00"
  score: number;
  mean_flight_ms: number;
  backspace_percentage: number;
  active_typing_seconds: number;
  status: AnalysisStatus;
}

export interface DayPoint {
  day: string; // "Pzt"
  avgScore: number;
  activeMinutes: number;
}

function statusFromScore(score: number): AnalysisStatus {
  if (score >= 80) return "OPTIMAL";
  if (score >= 65) return "SLIGHTLY_DISTRACTED";
  if (score >= 50) return "WARNING";
  return "FATIGUED";
}

export function demoDailyData(): HourPoint[] {
  const rand = rng(42);
  const points: HourPoint[] = [];
  for (let h = 8; h <= 20; h++) {
    // Gün ortası yüksek, öğleden sonra düşen tipik enerji eğrisi
    const base = 85 - Math.abs(h - 10.5) * 4.5 + rand() * 10;
    const score = Math.round(Math.min(98, Math.max(35, base)));
    points.push({
      hour: `${String(h).padStart(2, "0")}:00`,
      score,
      mean_flight_ms: Math.round(95 + (100 - score) * 0.9 + rand() * 12),
      backspace_percentage: Math.round((4 + (100 - score) * 0.08 + rand() * 2) * 10) / 10,
      active_typing_seconds: Math.round(60 + rand() * 110),
      status: statusFromScore(score),
    });
  }
  return points;
}

export function demoWeeklyData(): DayPoint[] {
  const rand = rng(7);
  const days = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
  return days.map((day, i) => ({
    day,
    avgScore: Math.round(62 + Math.sin(i) * 12 + rand() * 14),
    activeMinutes: Math.round(40 + rand() * 140),
  }));
}

export function demoSummary() {
  const daily = demoDailyData();
  const avg = Math.round(daily.reduce((s, p) => s + p.score, 0) / daily.length);
  const best = daily.reduce((a, b) => (b.score > a.score ? b : a));
  const worst = daily.reduce((a, b) => (b.score < a.score ? b : a));
  const last = daily[daily.length - 1];
  return {
    currentScore: last.score,
    currentStatus: last.status,
    todayAverage: avg,
    bestHour: best.hour,
    worstHour: worst.hour,
    avgFlightMs: Math.round(daily.reduce((s, p) => s + p.mean_flight_ms, 0) / daily.length),
    backspacePct:
      Math.round((daily.reduce((s, p) => s + p.backspace_percentage, 0) / daily.length) * 10) / 10,
    activeMinutes: Math.round(daily.reduce((s, p) => s + p.active_typing_seconds, 0) / 60),
  };
}
