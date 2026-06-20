/**
 * NeuroSpace Analiz Motoru
 * ---------------------------------------------------------------------------
 * Girdi: kullanıcının kişisel baseline'ı + gelen 3 dakikalık özet metrikler.
 * Çıktı: status, 0-100 cognitive score ve öneri.
 *
 * GİZLİLİK: Motor yalnızca sayısal özetlerle çalışır; metin içeriği yoktur.
 * ---------------------------------------------------------------------------
 */

export type AnalysisStatus =
  | "INSUFFICIENT_DATA"
  | "OPTIMAL"
  | "SLIGHTLY_DISTRACTED"
  | "WARNING"
  | "FATIGUED"
  | "RECOVERING";

export interface UserBaseline {
  avgFlightTime: number; // ms
  medianFlightTime: number; // ms
  backspaceRatio: number; // yüzde, örn. 5.0
  pauseRatio: number; // 0..1
}

export interface IncomingWindow {
  mean_flight_ms: number;
  median_flight_ms: number;
  p95_flight_ms?: number;
  backspace_percentage: number;
  total_samples: number;
  active_typing_seconds?: number;
  pause_ratio: number;
}

export type TrendDirection = "declining" | "recovering" | "stable" | "unknown";

export type Confidence = "low" | "medium" | "high";

export interface AnalysisResult {
  status: AnalysisStatus;
  score: number; // 0-100
  recommendation: string;
  trend: TrendDirection;
  confidence: Confidence;
  signals: {
    flightDeviation: number;
    backspaceDeviation: number;
    pauseDeviation: number;
    slowdownRisk: boolean;
    backspaceRisk: boolean;
  };
}

const MIN_SAMPLES = 20;
const SLOWDOWN_RISK_THRESHOLD = 1.25; // %25+ yavaşlama
const BACKSPACE_RISK_THRESHOLD = 1.4; // %40+ artış
const RELIABLE_SAMPLE_COUNT = 150; // tam güvenilir sayılan örnek sayısı

// Güven (confidence) eşikleri
// Baseline ne kadar çok pencereden kuruldu + bu pencerede ne kadar örnek var?
const CONFIDENCE_HIGH_BASELINE_WINDOWS = 10; // bu kadar pencereyle baseline olgun
const CONFIDENCE_HIGH_SAMPLES = 80; // bu kadar örnekle pencere güvenilir
const CONFIDENCE_MED_SAMPLES = 40;

// Trend tespiti için eşikler
const TREND_MIN_POINTS = 3; // anlamlı trend için en az 3 skor gerekir
const TREND_SLOPE_THRESHOLD = 2.5; // pencere başına ±2.5 puan = anlamlı eğim

/**
 * Son skorların doğrusal eğimini (least-squares slope) hesaplar.
 * scores: ESKİDEN YENİYE sıralı skor dizisi (yalnızca gerçek skorlar, >0).
 * Dönen değer: pencere başına ortalama puan değişimi.
 */
export function scoreSlope(scores: number[]): number {
  const n = scores.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = scores.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (scores[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/**
 * Son skorlardan trend yönü belirler.
 * Tek bir pencerenin gürültüsünü azaltır; eğilime bakar.
 */
export function detectTrend(recentScores: number[]): TrendDirection {
  const valid = recentScores.filter((s) => s > 0);
  if (valid.length < TREND_MIN_POINTS) return "unknown";
  const slope = scoreSlope(valid);
  if (slope <= -TREND_SLOPE_THRESHOLD) return "declining";
  if (slope >= TREND_SLOPE_THRESHOLD) return "recovering";
  return "stable";
}

const RECOMMENDATIONS: Record<AnalysisStatus, string> = {
  INSUFFICIENT_DATA:
    "Analiz için yeterli yazma verisi yok. Yazmaya devam edin.",
  OPTIMAL:
    "Harika gidiyorsunuz! Akış halindesiniz, bu temponun keyfini çıkarın.",
  SLIGHTLY_DISTRACTED:
    "Hafif bir odak kaybı var. Bildirimleri kapatmayı deneyin.",
  WARNING:
    "Odak düşüşü sinyali algılandı. 5 dakikalık kısa bir mola iyi gelebilir.",
  FATIGUED:
    "Belirgin yorgunluk sinyali. 15-20 dakikalık bir mola ve su molası önerilir.",
  RECOVERING:
    "Toparlanma görülüyor. Hafif görevlerle devam edin, tempoyu yavaşça artırın.",
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Sapma oranını 0-100 alt skoruna çevirir.
 * deviation = 1.0 -> 100 (baseline ile aynı). Sapma arttıkça lineer düşer:
 * her +%10 sapma ~13 puan düşürür (excess * 130 katsayısı).
 * Yalnızca KÖTÜLEŞME (deviation > 1) cezalandırılır; daha iyi performans
 * (deviation < 1) puan kaybettirmez, 100'de tutulur.
 */
function deviationToScore(deviation: number): number {
  if (!Number.isFinite(deviation) || deviation <= 0) return 50;
  const excess = Math.max(0, deviation - 1);
  return clamp(100 - excess * 130, 0, 100);
}

/**
 * Güven seviyesi: skora ne kadar güvenebiliriz?
 * - Baseline kaç pencereden kuruldu (olgunluk)
 * - Bu pencerede kaç örnek var (anlık güvenilirlik)
 * İkisinin de zayıf halkası kazanır (en kötü olan belirler).
 */
export function computeConfidence(
  baselineWindows: number,
  totalSamples: number
): Confidence {
  const baselineLevel: Confidence =
    baselineWindows >= CONFIDENCE_HIGH_BASELINE_WINDOWS
      ? "high"
      : baselineWindows >= CALIBRATION_WINDOWS * 2
        ? "medium"
        : "low";
  const sampleLevel: Confidence =
    totalSamples >= CONFIDENCE_HIGH_SAMPLES
      ? "high"
      : totalSamples >= CONFIDENCE_MED_SAMPLES
        ? "medium"
        : "low";
  const rank: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
  return rank[baselineLevel] <= rank[sampleLevel] ? baselineLevel : sampleLevel;
}

export function analyzeWindow(
  baseline: UserBaseline,
  current: IncomingWindow,
  previousStatus?: AnalysisStatus | null,
  recentScores: number[] = [],
  baselineWindows = CALIBRATION_WINDOWS
): AnalysisResult {
  // --- Kural 1: yetersiz veri ---
  if (current.total_samples < MIN_SAMPLES) {
    return {
      status: "INSUFFICIENT_DATA",
      score: 0,
      recommendation: RECOMMENDATIONS.INSUFFICIENT_DATA,
      trend: "unknown",
      confidence: "low",
      signals: {
        flightDeviation: 0,
        backspaceDeviation: 0,
        pauseDeviation: 0,
        slowdownRisk: false,
        backspaceRisk: false,
      },
    };
  }

  // --- Sapma oranları (sıfıra bölünme korumalı) ---
  const flightDeviation =
    baseline.avgFlightTime > 0
      ? current.mean_flight_ms / baseline.avgFlightTime
      : 1;
  const backspaceDeviation =
    baseline.backspaceRatio > 0
      ? current.backspace_percentage / baseline.backspaceRatio
      : current.backspace_percentage > 0
        ? 2 // baseline 0 iken backspace varsa belirgin sapma say
        : 1;
  const pauseDeviation =
    baseline.pauseRatio > 0 ? current.pause_ratio / baseline.pauseRatio : 1;

  // --- Risk sinyalleri ---
  const slowdownRisk = flightDeviation >= SLOWDOWN_RISK_THRESHOLD;
  const backspaceRisk = backspaceDeviation >= BACKSPACE_RISK_THRESHOLD;

  // --- Ağırlıklı cognitive score (0-100) ---
  // Yazma hızı %40, backspace %30, duraklama %20, veri güvenilirliği %10
  const speedScore = deviationToScore(flightDeviation);
  const backspaceScore = deviationToScore(backspaceDeviation);
  const pauseScore = deviationToScore(pauseDeviation);
  const reliabilityScore = clamp(
    (current.total_samples / RELIABLE_SAMPLE_COUNT) * 100,
    0,
    100
  );

  const score = Math.round(
    speedScore * 0.4 +
      backspaceScore * 0.3 +
      pauseScore * 0.2 +
      reliabilityScore * 0.1
  );

  // --- Trend analizi (tek pencere gürültüsünü azaltır) ---
  // Mevcut skoru da dahil ederek son skorların eğilimine bak.
  // Status'ten ÖNCE hesaplanır; FATIGUED kararı trende dayanır.
  const trend = detectTrend([...recentScores, score]);
  const previousWasBad =
    previousStatus === "FATIGUED" || previousStatus === "WARNING";

  // --- Durum belirleme ---
  // SİNYAL GÜVENİLİRLİĞİ: Tek izole kötü pencere hemen FATIGUED vermez.
  // İki risk birlikte olsa bile, yorgunluk ancak DOĞRULANIRSA ilan edilir:
  //   - önceki pencere de kötüydü (previousWasBad), VEYA
  //   - skor düşüş trendinde (trend === "declining").
  // Doğrulama yoksa ilk kötü pencere yalnızca WARNING'dir; kullanıcıyı
  // tek seferlik bir dalgalanma için "yorgunsun" diye paniğe sevk etmeyiz.
  let status: AnalysisStatus;
  if (slowdownRisk && backspaceRisk) {
    status = previousWasBad || trend === "declining" ? "FATIGUED" : "WARNING";
  } else if (slowdownRisk || backspaceRisk) {
    status = "WARNING";
  } else if (score >= 80) {
    status = "OPTIMAL";
  } else {
    status = "SLIGHTLY_DISTRACTED";
  }

  // RECOVERING: önceki pencere kötüyken bu pencere belirgin iyileşme gösteriyorsa
  if (previousWasBad && !slowdownRisk && !backspaceRisk && score >= 60) {
    status = "RECOVERING";
  }

  // Trend, status'ü zenginleştirir:
  // - Belirgin toparlanma trendi varsa ve riskler kalktıysa RECOVERING'i pekiştir.
  if (
    trend === "recovering" &&
    !slowdownRisk &&
    !backspaceRisk &&
    previousWasBad
  ) {
    status = "RECOVERING";
  }
  // - Risk yokken bile süregelen düşüş trendi erken uyarı verir
  //   (henüz eşiği aşmamış ama gidişat kötü).
  if (trend === "declining" && status === "OPTIMAL") {
    status = "SLIGHTLY_DISTRACTED";
  }

  const confidence = computeConfidence(baselineWindows, current.total_samples);

  // Trend bilgisini öneriye ekle (status ile tutarlı olacak şekilde).
  // RECOVERING/OPTIMAL'de "düşüştesin" demek çelişki olur; eklemeyiz.
  let recommendation = RECOMMENDATIONS[status];
  const positiveStatus = status === "RECOVERING" || status === "OPTIMAL";
  if (trend === "declining" && !positiveStatus && status !== "FATIGUED") {
    recommendation +=
      " Son ölçümlerde düşüş eğilimi var; yakında mola planlayın.";
  } else if (trend === "recovering" && status !== "OPTIMAL") {
    recommendation += " İyiye gidiyorsunuz, tempoyu koruyun.";
  }

  // DÜRÜST BELİRSİZLİK: Güven düşükken kesin/uyarıcı dili yumuşat.
  // Az veri veya taze baseline ile "yorgunsun" demek yerine ihtiyatlı konuş.
  if (confidence === "low" && (status === "FATIGUED" || status === "WARNING")) {
    recommendation =
      "Olası bir odak düşüşü sinyali var, ancak henüz yeterli veri toplanmadı; " +
      "skor netleştikçe daha güvenilir olacak.";
  }

  return {
    status,
    score,
    recommendation,
    trend,
    confidence,
    signals: {
      flightDeviation: Math.round(flightDeviation * 100) / 100,
      backspaceDeviation: Math.round(backspaceDeviation * 100) / 100,
      pauseDeviation: Math.round(pauseDeviation * 100) / 100,
      slowdownRisk,
      backspaceRisk,
    },
  };
}

/**
 * Kalibrasyon: yeterli pencere birikince baseline hesaplar.
 * En az CALIBRATION_WINDOWS adet geçerli pencere gerekir.
 */
export const CALIBRATION_WINDOWS = 2;

export interface WindowRow {
  mean_flight_ms: number;
  median_flight_ms: number;
  backspace_percentage: number;
  pause_ratio: number;
  total_samples: number;
}

export function computeBaseline(windows: WindowRow[]): UserBaseline | null {
  const valid = windows.filter((w) => w.total_samples >= MIN_SAMPLES);
  if (valid.length < CALIBRATION_WINDOWS) return null;

  const avg = (sel: (w: WindowRow) => number) =>
    valid.reduce((s, w) => s + sel(w), 0) / valid.length;

  return {
    avgFlightTime: Math.round(avg((w) => w.mean_flight_ms) * 10) / 10,
    medianFlightTime: Math.round(avg((w) => w.median_flight_ms) * 10) / 10,
    backspaceRatio: Math.round(avg((w) => w.backspace_percentage) * 10) / 10,
    pauseRatio: Math.round(avg((w) => w.pause_ratio) * 100) / 100,
  };
}

/**
 * Zaman-bağlamlı baseline: günü 4 dilime ayırır.
 * Böylece sabah dinç hâl ile akşam yorgun hâl ayrı baseline'lara göre ölçülür.
 */
export type TimeBucket = "morning" | "afternoon" | "evening" | "night";

export function bucketForHour(hour: number): TimeBucket {
  if (hour >= 5 && hour < 12) return "morning"; // 05:00–11:59
  if (hour >= 12 && hour < 17) return "afternoon"; // 12:00–16:59
  if (hour >= 17 && hour < 22) return "evening"; // 17:00–21:59
  return "night"; // 22:00–04:59
}

/** Bir dilimin saat aralığı. `wrap=true` ise gün sınırını aşar (night). */
export function bucketHourRange(bucket: TimeBucket): {
  low: number;
  high: number;
  wrap: boolean;
} {
  switch (bucket) {
    case "morning":
      return { low: 5, high: 12, wrap: false };
    case "afternoon":
      return { low: 12, high: 17, wrap: false };
    case "evening":
      return { low: 17, high: 22, wrap: false };
    case "night":
      // 22:00–04:59 => local_hour >= 22 VEYA local_hour < 5
      return { low: 22, high: 5, wrap: true };
  }
}

const BUCKET_LABELS: Record<TimeBucket, string> = {
  morning: "sabah",
  afternoon: "öğleden sonra",
  evening: "akşam",
  night: "gece",
};

export function bucketLabel(bucket: TimeBucket): string {
  return BUCKET_LABELS[bucket];
}
