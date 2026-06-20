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
import { logger, newRequestId } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
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

const ROUTE = "POST /api/typing-window";

// Normal kullanım 3 dakikada 1 penceredir; 60 sn'de 10 sınırı normali
// engellemeden bariz kötüye kullanımı (sel/spam) durdurur.
const RATE_WINDOW_SECONDS = 60;
const RATE_MAX_IN_WINDOW = 10;

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  try {
    // 1) Kimlik doğrulama --------------------------------------------------
    const auth = await authenticateRequest(req.headers.get("authorization"));
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    // 1a) Rate limit (kullanıcı bazlı, Supabase sayımı) --------------------
    const rate = await checkRateLimit(supabase, user.id, {
      table: "typing_windows",
      windowSeconds: RATE_WINDOW_SECONDS,
      maxInWindow: RATE_MAX_IN_WINDOW,
    });
    if (!rate.allowed) {
      logger.warn("rate limit exceeded", {
        requestId,
        route: ROUTE,
        userId: user.id,
        count: rate.count,
      });
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        }
      );
    }

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
      logger.error("typing_windows insert failed", insertErr, {
        requestId,
        route: ROUTE,
        userId: user.id,
      });
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

    // Confidence için: baseline kaç pencereden kuruldu?
    let baselineWindows = baselineRow?.sample_windows ?? 0;

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
        if (!blErr) {
          baseline = computed;
          baselineWindows = (history ?? []).length;
        }
      }

      if (!baseline) {
        // Hâlâ kalibrasyondayız — analiz yapma, durumu bildir.
        const calibrating = {
          status: "INSUFFICIENT_DATA" as AnalysisStatus,
          score: 0,
          recommendation: `Kalibrasyon sürüyor (${(history ?? []).length}/${CALIBRATION_WINDOWS} pencere, ${bucketLabel(bucket)}). Normal şekilde yazmaya devam edin.`,
          confidence: "low" as const,
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

    const result = analyzeWindow(
      baseline,
      data,
      previousStatus,
      recentScores,
      baselineWindows
    );

    const { error: reportErr } = await supabase
      .from("analysis_reports")
      .insert({
        user_id: user.id,
        typing_window_id: windowRow.id,
        time_bucket: bucket,
        status: result.status,
        score: result.score,
        recommendation: result.recommendation,
        confidence: result.confidence,
      });
    if (reportErr) {
      logger.error("analysis_reports insert failed", reportErr, {
        requestId,
        route: ROUTE,
        userId: user.id,
      });
    }

    return NextResponse.json(
      {
        status: result.status,
        score: result.score,
        recommendation: result.recommendation,
        trend: result.trend,
        confidence: result.confidence,
      },
      { status: 200 }
    );
  } catch (err) {
    // GÜVENLİK: İç hata detayları istemciye sızdırılmaz.
    logger.error("typing-window endpoint error", err, {
      requestId,
      route: ROUTE,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
