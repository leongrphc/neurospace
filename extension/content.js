/**
 * NeuroSpace Content Script
 * =========================================================================
 * GİZLİLİK SÖZLEŞMESİ (bu dosyanın değişmez kuralları):
 *  1. Basılan tuşun KARAKTER DEĞERİ asla bir değişkende SAKLANMAZ.
 *     event.key yalnızca anlık olarak "kontrol tuşu mu / Backspace mi"
 *     sınıflandırması için okunur ve hemen unutulur.
 *  2. Hiçbir metin, kelime, cümle veya input değeri okunmaz
 *     (element.value hiçbir yerde kullanılmaz).
 *  3. Sunucuya yalnızca 3 dakikalık ÖZET istatistikler gider (ham tuş
 *     listesi, timestamp dizisi vb. ASLA gönderilmez).
 *  4. Şifre, ödeme, kredi kartı, OTP gibi hassas alanlarda ölçüm tamamen
 *     devre dışıdır.
 * =========================================================================
 */

(() => {
  "use strict";

  // ---- Durum -------------------------------------------------------------
  let trackingEnabled = true; // popup'tan kontrol edilir
  let siteExcluded = false; // options'taki domain listesinden
  let lastKeyTs = null; // yalnızca zaman damgası (içerik DEĞİL)

  // 3 dakikalık pencere içi sayaçlar — yalnızca sayısal özetler tutulur.
  // flightTimes: iki geçerli tuş arasındaki ms farkları (karakter bilgisi yok)
  let windowState = createEmptyWindow();

  const WINDOW_MS = 3 * 60 * 1000; // 3 dakika
  const PAUSE_THRESHOLD_MS = 2000; // 2 sn üstü boşluk = duraklama
  const MAX_VALID_FLIGHT_MS = 5000; // 5 sn üstü farklar örnek sayılmaz

  function createEmptyWindow() {
    return {
      startedAt: Date.now(),
      flightTimes: [], // sadece sayısal ms değerleri
      backspaceCount: 0, // sadece sayaç — hangi karakterin silindiği bilinmez
      totalKeyCount: 0,
      pauseCount: 0,
      activeTypingMs: 0,
      // Backspace patlaması: ardışık silme serileri (dağınıklık sinyali).
      // Yalnızca sayaç; hangi karakterin silindiği yine bilinmez.
      backspaceBurstCount: 0, // 2+ ardışık silmeden oluşan seri sayısı
      currentBackspaceRun: 0, // anlık ardışık silme uzunluğu
    };
  }

  // ---- Hassas alan tespiti ------------------------------------------------
  // GİZLİLİK: Bu kontroller "ölçüm yapma" kararı içindir; alan içeriği okunmaz.
  const SENSITIVE_AUTOCOMPLETE = [
    "cc-number",
    "cc-csc",
    "cc-exp",
    "cc-exp-month",
    "cc-exp-year",
    "cc-name",
    "cc-type",
    "one-time-code",
    "current-password",
    "new-password",
  ];

  const SENSITIVE_PATTERN =
    /(password|passwd|pwd|card|cc-|cvv|cvc|csc|iban|otp|pin\b|secur|payment|billing|account.?number|routing|ssn|tckn|kimlik)/i;

  function isSensitiveField(el) {
    if (!el || !(el instanceof Element)) return false;

    const tag = el.tagName;
    if (tag === "INPUT") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      // KURAL: password / hidden / sayısal güvenlik tipleri => asla ölçme
      if (["password", "hidden", "tel"].includes(type)) return true;
    }

    const autocomplete = (el.getAttribute("autocomplete") || "").toLowerCase();
    if (SENSITIVE_AUTOCOMPLETE.some((v) => autocomplete.includes(v))) return true;

    // name / id / placeholder / aria-label üzerinden ödeme & OTP sezgisi
    const haystack = [
      el.getAttribute("name"),
      el.getAttribute("id"),
      el.getAttribute("placeholder"),
      el.getAttribute("aria-label"),
      el.getAttribute("data-testid"),
    ]
      .filter(Boolean)
      .join(" ");
    if (SENSITIVE_PATTERN.test(haystack)) return true;

    // Form düzeyinde ödeme sayfası sezgisi (action URL'si)
    const form = el.closest ? el.closest("form") : null;
    if (form && SENSITIVE_PATTERN.test(form.getAttribute("action") || "")) {
      return true;
    }

    return false;
  }

  function isEditableTarget(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      return ["text", "search", "email", "url"].includes(type);
    }
    return el.isContentEditable === true;
  }

  // ---- Tuş sınıflandırma ---------------------------------------------------
  // GİZLİLİK: event.key burada yalnızca kategori belirlemek için okunur,
  // hiçbir değişkene karakter olarak yazılmaz, loglanmaz, gönderilmez.
  function classifyKey(event) {
    const k = event.key;
    if (k === "Backspace" || k === "Delete") return "correction";
    // Tek karakterlik üretken tuşlar (harf/rakam/noktalama) — değeri umursamayız
    if (k.length === 1) return "productive";
    if (k === "Enter" || k === " " || k === "Spacebar") return "productive";
    return "ignored"; // Shift, Ctrl, ok tuşları vb.
  }

  // ---- Olay dinleyicisi ----------------------------------------------------
  document.addEventListener(
    "keydown",
    (event) => {
      if (!trackingEnabled || siteExcluded) return;
      // Yalnızca gerçek kullanıcı tuşları — sentetik/script tuşlarını yok say
      if (event.isTrusted !== true) return;

      const target = event.composedPath ? event.composedPath()[0] : event.target;
      if (!isEditableTarget(target)) return;

      // GİZLİLİK KAPISI: hassas alan => sayaç dahil HİÇBİR veri toplama
      if (isSensitiveField(target)) {
        lastKeyTs = null; // hassas alana geçişte zinciri de kopar
        return;
      }

      const kind = classifyKey(event);
      if (kind === "ignored") return;

      const now = performance.now();

      if (kind === "correction") {
        // Sadece sayaç artar; hangi karakterin silindiği bilinemez.
        windowState.backspaceCount += 1;
        windowState.totalKeyCount += 1;
        // Ardışık silme serisi: run 2'ye ulaştığında bir "burst" sayılır
        // (tek tük düzeltme değil, peş peşe silme = dağınıklık sinyali).
        windowState.currentBackspaceRun += 1;
        if (windowState.currentBackspaceRun === 2) {
          windowState.backspaceBurstCount += 1;
        }
        lastKeyTs = now;
        return;
      }

      // kind === "productive"
      windowState.totalKeyCount += 1;
      windowState.currentBackspaceRun = 0; // üretken tuş seriyi kırar

      if (lastKeyTs !== null) {
        const delta = now - lastKeyTs;
        if (delta <= MAX_VALID_FLIGHT_MS) {
          if (delta >= PAUSE_THRESHOLD_MS) {
            windowState.pauseCount += 1;
          } else {
            windowState.flightTimes.push(Math.round(delta));
            windowState.activeTypingMs += delta;
          }
        }
      }
      lastKeyTs = now;
    },
    { capture: true, passive: true }
  );

  // ---- 3 dakikalık özet üretimi --------------------------------------------
  function percentile(sortedArr, p) {
    if (sortedArr.length === 0) return 0;
    const idx = Math.min(
      sortedArr.length - 1,
      Math.ceil((p / 100) * sortedArr.length) - 1
    );
    return sortedArr[Math.max(0, idx)];
  }

  // Gerçek medyan: çift sayıda örnekte iki ortanca değerin ortalaması.
  function medianOf(sortedArr) {
    const n = sortedArr.length;
    if (n === 0) return 0;
    const mid = Math.floor(n / 2);
    return n % 2 === 0
      ? (sortedArr[mid - 1] + sortedArr[mid]) / 2
      : sortedArr[mid];
  }

  function buildSummary() {
    const ft = [...windowState.flightTimes].sort((a, b) => a - b);
    const n = ft.length;
    if (n === 0 && windowState.totalKeyCount === 0) return null;

    const mean = n ? ft.reduce((s, v) => s + v, 0) / n : 0;
    const median = medianOf(ft);
    const totalEvents = n + windowState.pauseCount;

    // Ritim tutarlılığı: varyasyon katsayısı (std / mean).
    // Yorgunlukta ritim sadece yavaşlamaz, DÜZENSİZLEŞİR. Yüksek CV = düzensiz.
    // GİZLİLİK: yalnızca tek bir oran; ham zaman dizisi gönderilmez.
    let flightCv = 0;
    if (n >= 2 && mean > 0) {
      const variance =
        ft.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n;
      flightCv = Math.round((Math.sqrt(variance) / mean) * 100) / 100;
    }

    // Backspace patlama oranı: ardışık silme serilerinin, toplam silmeye oranı.
    // Tek tük düzeltme yerine peş peşe silme baskınsa dağınıklık sinyali güçlenir.
    const backspaceBurstRatio =
      windowState.backspaceCount > 0
        ? Math.round(
            (windowState.backspaceBurstCount / windowState.backspaceCount) * 100
          ) / 100
        : 0;

    // GİZLİLİK: Yalnızca bu özet nesnesi gönderilir. Ham diziler burada ölür.
    return {
      mean_flight_ms: Math.round(mean * 10) / 10,
      median_flight_ms: Math.round(median * 10) / 10,
      p95_flight_ms: percentile(ft, 95),
      backspace_percentage:
        windowState.totalKeyCount > 0
          ? Math.round(
              (windowState.backspaceCount / windowState.totalKeyCount) * 1000
            ) / 10
          : 0,
      total_samples: n,
      active_typing_seconds: Math.round(windowState.activeTypingMs / 1000),
      pause_ratio:
        totalEvents > 0
          ? Math.round((windowState.pauseCount / totalEvents) * 100) / 100
          : 0,
      flight_cv: flightCv,
      backspace_burst_ratio: backspaceBurstRatio,
      window_started_at: new Date(windowState.startedAt).toISOString(),
      window_ended_at: new Date().toISOString(),
      // Zaman-bağlamlı baseline için yerel saat (0-23). İçerik DEĞİL, yalnızca saat.
      local_hour: new Date().getHours(),
    };
  }

  function flushWindow() {
    const summary = buildSummary();
    windowState = createEmptyWindow();
    lastKeyTs = null;
    if (!summary) return;

    // Özet, gönderim/queue yönetimi için service worker'a iletilir.
    try {
      chrome.runtime.sendMessage({ type: "NS_WINDOW_SUMMARY", payload: summary });
    } catch (_e) {
      // Extension context kaybolduysa sessizce vazgeç (veri zaten anonim özet).
    }
  }

  setInterval(flushWindow, WINDOW_MS);

  // Sekme kapanırken/gizlenirken eldeki özeti kaybetme.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushWindow();
  });

  // ---- Ayarları yükle ve değişiklikleri dinle ------------------------------
  function applySettings(settings) {
    trackingEnabled = settings?.trackingEnabled !== false;
    const excluded = settings?.excludedDomains || [];
    const host = location.hostname.replace(/^www\./, "");
    siteExcluded = excluded.some((d) => host === d || host.endsWith("." + d));
  }

  chrome.storage.sync.get(["trackingEnabled", "excludedDomains"], applySettings);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    chrome.storage.sync.get(["trackingEnabled", "excludedDomains"], applySettings);
  });

  // ---- Üst banner bildirimi -------------------------------------------------
  // GİZLİLİK: Banner yalnızca service worker'dan gelen anonim durum/öneriyi
  // gösterir; hiçbir veri okumaz veya göndermez.
  const BANNER_ID = "neurospace-banner";

  const BANNER_THEME = {
    FATIGUED: { bg: "#ef4444", icon: "⚠️" },
    WARNING: { bg: "#eab308", icon: "⏳" },
    SLIGHTLY_DISTRACTED: { bg: "#f59e0b", icon: "•" },
    RECOVERING: { bg: "#6366f1", icon: "↗" },
    OPTIMAL: { bg: "#22c55e", icon: "✓" },
  };

  function showBanner(report) {
    const theme = BANNER_THEME[report.status] || BANNER_THEME.WARNING;

    // Var olan banner'ı kaldır (üst üste binmesin)
    document.getElementById(BANNER_ID)?.remove();

    const bar = document.createElement("div");
    bar.id = BANNER_ID;
    bar.setAttribute("role", "status");
    bar.style.cssText = [
      "position:fixed",
      "top:0",
      "left:0",
      "right:0",
      "z-index:2147483647", // mümkün olan en üst katman
      "display:flex",
      "align-items:center",
      "gap:12px",
      "padding:12px 18px",
      `background:${theme.bg}`,
      "color:#fff",
      "font:600 14px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif",
      "box-shadow:0 2px 12px rgba(0,0,0,.25)",
      "transform:translateY(-100%)",
      "transition:transform .35s ease",
    ].join(";");

    const icon = document.createElement("span");
    icon.textContent = theme.icon;
    icon.style.cssText = "font-size:18px;flex-shrink:0";

    const msg = document.createElement("span");
    msg.textContent = `NeuroSpace — ${report.recommendation || ""}`;
    msg.style.cssText = "flex:1";

    const close = document.createElement("button");
    close.textContent = "✕";
    close.setAttribute("aria-label", "Kapat");
    close.style.cssText = closeBtnCss();

    let hideTimer = null;
    const dismiss = () => {
      bar.style.transform = "translateY(-100%)";
      setTimeout(() => bar.remove(), 350);
      if (hideTimer) clearTimeout(hideTimer);
    };
    close.addEventListener("click", dismiss);

    bar.append(icon, msg);

    // AKSİYON DÖNGÜSÜ: Yorgunluk/uyarı durumunda "Mola başlat" sun.
    // Mola bitince kısa bir geri bildirim sorulur (sayfa içi, sunucuya gitmez).
    if (report.status === "FATIGUED" || report.status === "WARNING") {
      const breakBtn = document.createElement("button");
      breakBtn.textContent = "☕ Mola başlat";
      breakBtn.style.cssText = actionBtnCss();
      breakBtn.addEventListener("click", () => {
        if (hideTimer) clearTimeout(hideTimer);
        startBreak(bar, theme.bg);
      });
      bar.append(breakBtn);
    }

    bar.append(close);
    document.documentElement.appendChild(bar);

    // Kayarak in
    requestAnimationFrame(() => {
      bar.style.transform = "translateY(0)";
    });

    // 8 sn sonra otomatik kapan
    hideTimer = setTimeout(dismiss, 8000);
  }

  // ---- Mola sayacı + geri bildirim -----------------------------------------
  const BREAK_SECONDS = 5 * 60; // 5 dakikalık kısa mola

  function closeBtnCss() {
    return [
      "background:rgba(255,255,255,.2)",
      "border:none",
      "color:#fff",
      "width:26px",
      "height:26px",
      "border-radius:6px",
      "cursor:pointer",
      "font-size:13px",
      "flex-shrink:0",
    ].join(";");
  }

  function actionBtnCss() {
    return [
      "background:rgba(255,255,255,.92)",
      "border:none",
      "color:#111",
      "padding:7px 14px",
      "border-radius:8px",
      "cursor:pointer",
      "font:700 13px system-ui,-apple-system,'Segoe UI',sans-serif",
      "flex-shrink:0",
    ].join(";");
  }

  // Banner'ı mola sayacı moduna geçirir.
  function startBreak(bar, bg) {
    let remaining = BREAK_SECONDS;
    bar.textContent = "";
    bar.style.background = bg;

    const label = document.createElement("span");
    label.style.cssText = "flex:1";
    const timer = document.createElement("span");
    timer.style.cssText =
      "font-variant-numeric:tabular-nums;font-weight:800;font-size:16px";

    const fmt = (s) =>
      `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    const render = () => {
      label.textContent = "NeuroSpace — Mola zamanı. Ekrandan birkaç dakika uzaklaş.";
      timer.textContent = fmt(remaining);
    };
    render();

    const skip = document.createElement("button");
    skip.textContent = "Molayı bitir";
    skip.style.cssText = actionBtnCss();

    let tick = null;
    const finish = () => {
      if (tick) clearInterval(tick);
      askFeedback(bar, bg);
    };
    skip.addEventListener("click", finish);

    bar.append(label, timer, skip);

    tick = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        finish();
      } else {
        render();
      }
    }, 1000);
  }

  // Mola sonrası kısa geri bildirim — yalnızca yerel, sunucuya gönderilmez.
  function askFeedback(bar, bg) {
    bar.textContent = "";
    bar.style.background = bg;

    const label = document.createElement("span");
    label.textContent = "NeuroSpace — Şimdi nasıl hissediyorsun?";
    label.style.cssText = "flex:1";

    const dismiss = () => {
      bar.style.transform = "translateY(-100%)";
      setTimeout(() => bar.remove(), 350);
    };

    const better = document.createElement("button");
    better.textContent = "👍 Daha iyi";
    better.style.cssText = actionBtnCss();

    const same = document.createElement("button");
    same.textContent = "😐 Aynı";
    same.style.cssText = actionBtnCss();

    const thank = (msg) => {
      bar.textContent = "";
      const t = document.createElement("span");
      t.textContent = `NeuroSpace — ${msg}`;
      t.style.cssText = "flex:1";
      bar.append(t);
      setTimeout(dismiss, 3000);
    };

    better.addEventListener("click", () =>
      thank("Harika, tempona kademeli dönebilirsin.")
    );
    same.addEventListener("click", () =>
      thank("Sorun değil, biraz daha dinlenmek iyi gelebilir.")
    );

    bar.append(label, better, same);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "NS_SHOW_BANNER" && message.report) {
      showBanner(message.report);
    }
  });
})();

