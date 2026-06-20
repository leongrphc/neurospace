/**
 * POST /api/typing-window
 * ---------------------------------------------------------------------------
 * Extension'dan gelen 3 dakikalık ANONİM özet metrik paketini alır:
 *  1. Bearer token ile kimlik doğrular (Supabase Auth).
 *  2. Payload'ı whitelist tabanlı doğrular (fazladan alanlar düşer).
 *  3. typing_windows tablosuna kaydeder (RLS aktif).
 *  4. Baseline hazırsa analiz motorunu çalıştırır; değilse kalibrasyon
 *     modunda veri biriktirir ve yeterli olunca baseline'ı hesaplar.
 *  5. Sonucu analysis_reports'a yazar ve { status, score, recommendation }
 *     döndürür.
 *
 * GİZLİLİK: Bu endpoint metin/karakter verisi kabul ETMEZ; validation
 * katmanı sayısal özet dışındaki her şeyi düşürür.
 * ---------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import { validateTypingWindow } from "@/lib/validation";
import {
  analyzeWindow,
  computeBaseline,
  CALIBRATION_WINDOWS,
  bucketForHour,
  bucketHourRange,
  bucketLabel,
  type AnalysisStatus,
  type UserBaseline,
} from "@/lib/analysis-engine";

export async function POST(req: NextRequest) {
  try {
    // 1) Kimlik doğrulama --------------------------------------------------
    const auth = await authenticateRequest(req.headers.get("authorization"));
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    // 2) Payload doğrulama --------------------------------------------------
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const { data, errors } = validateTypingWindow(body);
    if (errors) {
      return NextResponse.json(
        { error: "Validation failed", details: errors },
        { status: 422 }
      );
    }

    // 3) Pencereyi kaydet (RLS: yalnızca kendi user_id'siyle insert edebilir)
    const { data: windowRow, error: insertErr } = await supabase
      .from("typing_windows")
      .insert({ user_id: user.id, ...data })
      .select("id")
      .single();
    if (insertErr) {
      console.error("typing_windows insert failed:", insertErr.message);
      return NextResponse.json({ error: "Storage error" }, { status: 500 });
    }

    // Zaman-bağlamlı baseline: pencerenin saatine göre günün dilimi
    const bucket = bucketForHour(data.local_hour);

    // 4) Baseline kontrolü (bu dilime özel) ---------------------------------
    const { data: baselineRow } = await supabase
      .from("baselines")
      .select("*")
      .eq("user_id", user.id)
      .eq("time_bucket", bucket)
      .maybeSingle();

    let baseline: UserBaseline | null = baselineRow?.is_ready
      ? {
          avgFlightTime: baselineRow.avg_flight_ms,
          medianFlightTime: baselineRow.median_flight_ms,
          backspaceRatio: baselineRow.backspace_ratio,
          pauseRatio: baselineRow.pause_ratio,
        }
      : null;

    // 4a) Kalibrasyon modu: bu dilim için baseline yoksa biriktir, yetince hesapla
    if (!baseline) {
      // Yalnızca aynı dilime ait pencerelerle kalibre et
      const lowHigh = bucketHourRange(bucket);
      let q = supabase
        .from("typing_windows")
        .select(
          "mean_flight_ms, median_flight_ms, backspace_percentage, pause_ratio, total_samples"
        )
        .eq("user_id", user.id);
      // night dilimi gün sınırını aştığı için OR filtresi gerekiyor
      q = lowHigh.wrap
        ? q.or(`local_hour.gte.${lowHigh.low},local_hour.lt.${lowHigh.high}`)
        : q.gte("local_hour", lowHigh.low).lt("local_hour", lowHigh.high);

      const { data: history } = await q
        .order("created_at", { ascending: false })
        .limit(CALIBRATION_WINDOWS * 3);

      const computed = computeBaseline(history ?? []);
      if (computed) {
        const { error: blErr } = await supabase.from("baselines").upsert({
          user_id: user.id,
          time_bucket: bucket,
          avg_flight_ms: computed.avgFlightTime,
          median_flight_ms: computed.medianFlightTime,
          backspace_ratio: computed.backspaceRatio,
          pause_ratio: computed.pauseRatio,
          sample_windows: (history ?? []).length,
          is_ready: true,
          updated_at: new Date().toISOString(),
        });
        if (!blErr) baseline = computed;
      }

      if (!baseline) {
        // Hâlâ kalibrasyondayız — analiz yapma, durumu bildir.
        const calibrating = {
          status: "INSUFFICIENT_DATA" as AnalysisStatus,
          score: 0,
          recommendation: `Kalibrasyon sürüyor (${(history ?? []).length}/${CALIBRATION_WINDOWS} pencere, ${bucketLabel(bucket)}). Normal şekilde yazmaya devam edin.`,
        };
        await supabase.from("analysis_reports").insert({
          user_id: user.id,
          typing_window_id: windowRow.id,
          time_bucket: bucket,
          ...calibrating,
        });
        return NextResponse.json(calibrating, { status: 200 });
      }
    }

    // 5) Analiz motoru ---------------------------------------------------------
    // Trend için aynı dilimin son raporlarını çek (yeniden eskiye).
    const { data: recentReports } = await supabase
      .from("analysis_reports")
      .select("status, score, created_at")
      .eq("user_id", user.id)
      .eq("time_bucket", bucket)
      .order("created_at", { ascending: false })
      .limit(6);

    const previousStatus =
      (recentReports?.[0]?.status as AnalysisStatus) ?? null;

    // Trend fonksiyonu ESKİDEN YENİYE skor bekler; yalnızca gerçek skorlar (>0).
    const recentScores = (recentReports ?? [])
      .slice()
      .reverse()
      .map((r) => r.score as number)
      .filter((s) => typeof s === "number" && s > 0);

    const result = analyzeWindow(baseline, data, previousStatus, recentScores);

    const { error: reportErr } = await supabase.from("analysis_reports").insert({
      user_id: user.id,
      typing_window_id: windowRow.id,
      time_bucket: bucket,
      status: result.status,
      score: result.score,
      recommendation: result.recommendation,
    });
    if (reportErr) {
      console.error("analysis_reports insert failed:", reportErr.message);
    }

    return NextResponse.json(
      {
        status: result.status,
        score: result.score,
        recommendation: result.recommendation,
        trend: result.trend,
      },
      { status: 200 }
    );
  } catch (err) {
    // GÜVENLİK: İç hata detayları istemciye sızdırılmaz.
    console.error("typing-window endpoint error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
