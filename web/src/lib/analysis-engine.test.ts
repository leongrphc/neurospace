/**
 * NeuroSpace Analiz Motoru — birim testleri
 * Çalıştırma: npm test  (node --test, tsx loader ile)
 *
 * Bu testler eşik/ağırlık/trend mantığının güvenlik ağıdır: motor davranışı
 * değişince beklenmedik kırılmalar burada yakalanır.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeWindow,
  computeBaseline,
  bucketForHour,
  bucketHourRange,
  detectTrend,
  scoreSlope,
  type UserBaseline,
  type IncomingWindow,
} from "./analysis-engine";

const baseline: UserBaseline = {
  avgFlightTime: 100,
  medianFlightTime: 92,
  backspaceRatio: 5,
  pauseRatio: 0.18,
};

function win(overrides: Partial<IncomingWindow> = {}): IncomingWindow {
  return {
    mean_flight_ms: 100,
    median_flight_ms: 92,
    p95_flight_ms: 200,
    backspace_percentage: 5,
    total_samples: 120,
    active_typing_seconds: 115,
    pause_ratio: 0.18,
    ...overrides,
  };
}

// ---- Yetersiz veri ---------------------------------------------------------
test("total_samples eşiğin altındaysa INSUFFICIENT_DATA", () => {
  const r = analyzeWindow(baseline, win({ total_samples: 5 }));
  assert.equal(r.status, "INSUFFICIENT_DATA");
  assert.equal(r.score, 0);
  assert.equal(r.trend, "unknown");
});

// ---- Optimal ---------------------------------------------------------------
test("baseline ile aynı performans yüksek skor + OPTIMAL verir", () => {
  const r = analyzeWindow(baseline, win());
  assert.ok(r.score >= 80, `skor beklenenden düşük: ${r.score}`);
  assert.equal(r.status, "OPTIMAL");
});

// ---- Tek risk => WARNING ---------------------------------------------------
test("yalnızca yavaşlama riski => WARNING", () => {
  // mean 130 / baseline 100 = 1.3 >= 1.25 (slowdown), backspace normal
  const r = analyzeWindow(baseline, win({ mean_flight_ms: 130 }));
  assert.equal(r.signals.slowdownRisk, true);
  assert.equal(r.signals.backspaceRisk, false);
  assert.equal(r.status, "WARNING");
});

test("yalnızca backspace riski => WARNING", () => {
  // backspace 7.5 / baseline 5 = 1.5 >= 1.4 (risk), hız normal
  const r = analyzeWindow(baseline, win({ backspace_percentage: 7.5 }));
  assert.equal(r.signals.slowdownRisk, false);
  assert.equal(r.signals.backspaceRisk, true);
  assert.equal(r.status, "WARNING");
});

// ---- İki risk birlikte => FATIGUED -----------------------------------------
test("hem yavaşlama hem backspace riski => FATIGUED", () => {
  const r = analyzeWindow(
    baseline,
    win({ mean_flight_ms: 130, backspace_percentage: 7.5 })
  );
  assert.equal(r.signals.slowdownRisk, true);
  assert.equal(r.signals.backspaceRisk, true);
  assert.equal(r.status, "FATIGUED");
});

// ---- Spec örneği (referans senaryo) ----------------------------------------
test("spec örnek girdisi: mean 130 + backspace 7.5 => FATIGUED, makul skor", () => {
  const r = analyzeWindow(
    baseline,
    win({
      mean_flight_ms: 130,
      median_flight_ms: 118,
      backspace_percentage: 7.5,
      total_samples: 150,
      pause_ratio: 0.21,
    })
  );
  assert.equal(r.status, "FATIGUED");
  assert.ok(r.score > 40 && r.score < 80, `skor aralık dışı: ${r.score}`);
});

// ---- RECOVERING ------------------------------------------------------------
test("önceki WARNING + temiz pencere => RECOVERING", () => {
  const r = analyzeWindow(baseline, win(), "WARNING");
  assert.equal(r.status, "RECOVERING");
});

// ---- Skor sınırları --------------------------------------------------------
test("skor 0-100 aralığında kalır (aşırı kötü girdi)", () => {
  const r = analyzeWindow(
    baseline,
    win({ mean_flight_ms: 900, backspace_percentage: 90, pause_ratio: 0.99 })
  );
  assert.ok(r.score >= 0 && r.score <= 100);
});

// ---- Trend: eğim -----------------------------------------------------------
test("scoreSlope artan dizide pozitif, azalanda negatif", () => {
  assert.ok(scoreSlope([50, 60, 70, 80]) > 0);
  assert.ok(scoreSlope([80, 70, 60, 50]) < 0);
  assert.equal(scoreSlope([70, 70, 70]), 0);
});

test("detectTrend düşüş/toparlanma/stabil/bilinmeyen", () => {
  assert.equal(detectTrend([90, 80, 70, 60]), "declining");
  assert.equal(detectTrend([60, 70, 80, 90]), "recovering");
  assert.equal(detectTrend([75, 76, 74, 75]), "stable");
  assert.equal(detectTrend([80]), "unknown"); // yetersiz nokta
});

test("declining trend öneriye erken uyarı ekler", () => {
  // Hafif bozuk pencere (risk eşiği altında ama skoru düşüren) + düşen geçmiş.
  // mean 122/100=1.22 < 1.25 => risk yok; status SLIGHTLY_DISTRACTED kalır.
  const r = analyzeWindow(
    baseline,
    win({ mean_flight_ms: 122, backspace_percentage: 6 }),
    null,
    [92, 85, 80]
  );
  assert.equal(r.trend, "declining");
  assert.equal(r.signals.slowdownRisk, false);
  assert.ok(
    r.recommendation.includes("düşüş eğilimi"),
    `öneri düşüş uyarısı içermeli: "${r.recommendation}"`
  );
});

test("RECOVERING/OPTIMAL durumunda düşüş uyarısı eklenmez (çelişki yok)", () => {
  const r = analyzeWindow(baseline, win(), "WARNING", [60, 65, 70]);
  // status pozitif olmalı; öneri 'düşüş eğilimi' içermemeli
  assert.ok(r.status === "RECOVERING" || r.status === "OPTIMAL");
  assert.ok(!r.recommendation.includes("düşüş eğilimi"));
});

test("declining trend, yüksek-ama-düşen skorda OPTIMAL'i SLIGHTLY_DISTRACTED'a düşürür", () => {
  // Skor hâlâ yüksek (>=80, normalde OPTIMAL) ama geçmiş istikrarlı düşüyor.
  // Erken uyarı: riskler eşiği aşmadan gidişat kötüyse OPTIMAL'den indir.
  const r = analyzeWindow(baseline, win({ mean_flight_ms: 115 }), null, [
    98, 92, 86,
  ]);
  assert.ok(r.score >= 80, `skor OPTIMAL eşiğinde olmalı: ${r.score}`);
  assert.equal(r.trend, "declining");
  assert.equal(r.signals.slowdownRisk, false);
  assert.equal(r.signals.backspaceRisk, false);
  assert.equal(r.status, "SLIGHTLY_DISTRACTED");
});

test("recovering trend, önceki WARNING + temiz pencere RECOVERING'i pekiştirir", () => {
  const r = analyzeWindow(baseline, win(), "WARNING", [55, 65, 78]);
  assert.equal(r.trend, "recovering");
  assert.equal(r.status, "RECOVERING");
});

// ---- Baseline hesaplama ----------------------------------------------------
test("computeBaseline yetersiz pencerede null döner", () => {
  const rows = [
    {
      mean_flight_ms: 100,
      median_flight_ms: 92,
      backspace_percentage: 5,
      pause_ratio: 0.18,
      total_samples: 120,
    },
  ];
  assert.equal(computeBaseline(rows), null);
});

test("computeBaseline yeterli pencerede ortalama baseline üretir", () => {
  const rows = Array.from({ length: 12 }, () => ({
    mean_flight_ms: 100,
    median_flight_ms: 92,
    backspace_percentage: 5,
    pause_ratio: 0.18,
    total_samples: 120,
  }));
  const b = computeBaseline(rows);
  assert.ok(b);
  assert.equal(b!.avgFlightTime, 100);
  assert.equal(b!.backspaceRatio, 5);
});

// ---- Zaman dilimi ----------------------------------------------------------
test("bucketForHour saatleri doğru dilime atar", () => {
  assert.equal(bucketForHour(8), "morning");
  assert.equal(bucketForHour(14), "afternoon");
  assert.equal(bucketForHour(19), "evening");
  assert.equal(bucketForHour(2), "night");
  assert.equal(bucketForHour(23), "night");
});

test("bucketHourRange night dilimi gün sınırını aşar (wrap)", () => {
  const night = bucketHourRange("night");
  assert.equal(night.wrap, true);
  const morning = bucketHourRange("morning");
  assert.equal(morning.wrap, false);
});
