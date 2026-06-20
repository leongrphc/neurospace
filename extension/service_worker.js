/**
 * NeuroSpace Service Worker
 * ----------------------------------------------------------------------
 * Görevleri:
 *  - Content script'ten gelen 3 dakikalık ÖZET metrik paketini alır.
 *  - HTTPS üzerinden API'ye gönderir (Authorization: Bearer <Supabase JWT>).
 *  - Gönderim başarısız olursa kısa süreli lokal queue'da saklar ve
 *    chrome.alarms ile tekrar dener.
 *
 * GİZLİLİK: Bu dosyada hiçbir ham tuş verisi yoktur; yalnızca content.js'in
 * ürettiği anonim sayısal özetler işlenir.
 * ----------------------------------------------------------------------
 */

const QUEUE_KEY = "ns_pending_queue";
const MAX_QUEUE_SIZE = 20; // en fazla 20 özet (≈1 saat) saklanır
const MAX_ITEM_AGE_MS = 60 * 60 * 1000; // 1 saatten eski özetler atılır
const RETRY_ALARM = "ns_retry_queue";

// ---- Ayarlar -------------------------------------------------------------
async function getConfig() {
  const sync = await chrome.storage.sync.get(["apiBaseUrl", "trackingEnabled"]);
  const local = await chrome.storage.local.get([
    "accessToken",
    "refreshToken",
    "tokenExpiresAt",
    "supabaseUrl",
    "supabaseAnonKey",
  ]);
  return {
    apiBaseUrl: sync.apiBaseUrl || "",
    trackingEnabled: sync.trackingEnabled !== false,
    accessToken: local.accessToken || "",
    refreshToken: local.refreshToken || "",
    tokenExpiresAt: local.tokenExpiresAt || 0,
    supabaseUrl: local.supabaseUrl || "",
    supabaseAnonKey: local.supabaseAnonKey || "",
  };
}

// ---- Token yenileme --------------------------------------------------------
// GÜVENLİK: Süresi yaklaşan access token, refresh_token ile sessizce yenilenir.
// Böylece kullanıcı her saat yeniden giriş yapmak zorunda kalmaz.
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000; // süre dolmadan 1 dk önce yenile

async function ensureFreshToken(cfg) {
  if (!cfg.accessToken) return cfg.accessToken;
  const stillValid = cfg.tokenExpiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS;
  if (stillValid) return cfg.accessToken;
  if (!cfg.refreshToken || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    return cfg.accessToken; // yenileyemiyoruz, mevcutla dene
  }

  try {
    const res = await fetch(
      `${cfg.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          apikey: cfg.supabaseAnonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: cfg.refreshToken }),
      }
    );
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      // Refresh token da geçersiz => yeniden giriş gerekli
      await chrome.storage.local.set({ authExpired: true });
      return cfg.accessToken;
    }
    await chrome.storage.local.set({
      accessToken: data.access_token,
      refreshToken: data.refresh_token || cfg.refreshToken,
      tokenExpiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
      authExpired: false,
    });
    return data.access_token;
  } catch (_e) {
    return cfg.accessToken;
  }
}

// ---- Mesaj alma ------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "NS_WINDOW_SUMMARY") {
    handleSummary(message.payload, sender.tab?.id).then(() => sendResponse({ ok: true }));
    return true; // async response
  }
  if (message?.type === "NS_GET_STATUS") {
    chrome.storage.local
      .get(["lastReport", "accessToken", "authExpired"])
      .then((data) => sendResponse(data));
    return true;
  }
  // TEST: popup'taki test butonları belirli bir durumu tetikler.
  // Cooldown'ı bypass ederek bildirimi anında gösterir (yalnızca deneme amaçlı).
  if (message?.type === "NS_TEST_NOTIFY") {
    triggerTestNotification(message.status).then((ok) =>
      sendResponse({ ok })
    );
    return true;
  }
  return false;
});

// ---- Test bildirimi --------------------------------------------------------
// Verilen status'e karşılık gelen sahte raporu kurar, cooldown'ı sıfırlar ve
// bildirimi anında gösterir. Rozet ve lastReport de güncellenir ki popup'ta
// görülebilsin. GERÇEK veri göndermez; yalnızca yerel görsel deneme içindir.
const TEST_REPORTS = {
  FATIGUED: {
    status: "FATIGUED",
    score: 28,
    trend: "declining",
    recommendation:
      "Belirgin yorgunluk sinyali. 15-20 dakikalık bir mola ve su molası önerilir.",
  },
  WARNING: {
    status: "WARNING",
    score: 58,
    trend: "declining",
    recommendation: "Odak düşüşü sinyali algılandı. Kısa bir mola iyi gelebilir.",
  },
  RECOVERING: {
    status: "RECOVERING",
    score: 72,
    trend: "recovering",
    recommendation: "Toparlanma görülüyor. Tempoyu yavaşça artırın.",
  },
  OPTIMAL: {
    status: "OPTIMAL",
    score: 95,
    trend: "stable",
    recommendation: "Harika gidiyorsunuz! Akış halindesiniz.",
  },
};

async function triggerTestNotification(status) {
  const report = TEST_REPORTS[status];
  if (!report) return false;

  // Cooldown'ları sıfırla ki test bildirimi kesin görünsün.
  await chrome.storage.local.set({ notifyTimes: {}, lastNotifyAt: 0 });
  // OPTIMAL flow bildirimi için seriyi yüksek tut.
  if (status === "OPTIMAL") {
    await chrome.storage.local.set({ flowStreak: 4 });
  }

  // Rozet + lastReport güncelle (popup'ta da görülsün)
  chrome.action.setBadgeText({ text: String(report.score) });
  chrome.action.setBadgeBackgroundColor({
    color:
      report.score >= 70 ? "#22c55e" : report.score >= 50 ? "#eab308" : "#ef4444",
  });
  await chrome.storage.local.set({
    lastReport: { ...report, receivedAt: Date.now() },
  });

  await maybeNotify(report);
  return true;
}

async function handleSummary(summary, sourceTabId) {
  const cfg = await getConfig();
  if (!cfg.trackingEnabled) return;
  if (!cfg.apiBaseUrl || !cfg.accessToken) {
    // Henüz yapılandırılmamış: sessizce at (anonim özet bile saklanmaz).
    return;
  }
  // GÜVENLİK: Yalnızca HTTPS endpoint'lere gönderim yapılır.
  if (!cfg.apiBaseUrl.startsWith("https://")) return;

  // Token süresi dolmak üzereyse yenile, sonra gönder.
  cfg.accessToken = await ensureFreshToken(cfg);

  const ok = await sendToApi(cfg, summary, sourceTabId);
  if (!ok) await enqueue(summary);
}

// ---- API gönderimi ---------------------------------------------------------
async function sendToApi(cfg, summary, sourceTabId) {
  try {
    const res = await fetch(`${cfg.apiBaseUrl}/api/typing-window`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.accessToken}`,
      },
      body: JSON.stringify(summary),
    });

    if (res.status === 401) {
      // Token süresi dolmuş — kullanıcı options sayfasından yeniden girmeli.
      await chrome.storage.local.set({ authExpired: true });
      return false;
    }
    if (!res.ok) return false;

    const report = await res.json(); // { status, score, recommendation }
    await chrome.storage.local.set({
      lastReport: { ...report, receivedAt: Date.now() },
      authExpired: false,
    });

    // Araç çubuğu rozetinde skoru göster
    if (typeof report.score === "number") {
      chrome.action.setBadgeText({ text: String(report.score) });
      chrome.action.setBadgeBackgroundColor({
        color:
          report.score >= 70
            ? "#22c55e"
            : report.score >= 50
            ? "#eab308"
            : "#ef4444",
      });
    }

    // Akıllı bildirim (throttle'lı, çok durumlu)
    await maybeNotify(report, sourceTabId);
    return true;
  } catch (_err) {
    return false;
  }
}

// ---- Akıllı bildirimler ----------------------------------------------------
// Duruma göre farklı bildirim üretir. Spam olmaması için her bildirim tipinin
// kendi cooldown'ı vardır ve yalnızca ayar açıkken gösterilir.
const COOLDOWN = {
  fatigue: 20 * 60 * 1000, // yorgunluk: 20 dk
  declining: 15 * 60 * 1000, // düşüş erken uyarısı: 15 dk
  recovering: 30 * 60 * 1000, // toparlanma tebriği: 30 dk
  flow: 60 * 60 * 1000, // uzun akış pekiştirmesi: 60 dk
};

// Hangi bildirim tipi gösterilecek? Öncelik sırasıyla karar verilir.
// Mesaj olarak HER ZAMAN motorun ürettiği report.recommendation tercih edilir
// (tek doğru kaynak): böylece dashboard, banner ve OS bildirimi tutarlı olur.
// recommendation yoksa duruma uygun bir yedek metin kullanılır.
function pickNotification(report, flowStreak) {
  if (report.status === "FATIGUED") {
    return {
      kind: "fatigue",
      title: "NeuroSpace — Mola zamanı",
      message:
        report.recommendation ||
        "Belirgin yorgunluk sinyali. 15-20 dakikalık bir mola iyi gelebilir.",
    };
  }
  // Uyarı durumunda trend beklemeden bildirim üret.
  // Backspace artışı veya yazma yavaşlaması tek pencerede WARNING'a düşürebilir;
  // kullanıcı bunu hemen görmelidir.
  if (report.status === "WARNING") {
    return {
      kind: "declining",
      title: "NeuroSpace — Odak uyarısı",
      message:
        report.recommendation ||
        "Odak düşüşü sinyali algılandı. Kısa bir nefes molası iyi gelebilir.",
    };
  }
  // Henüz uyarı değil ama gidişat kötü: erken uyarı
  if (report.trend === "declining" && report.status === "SLIGHTLY_DISTRACTED") {
    return {
      kind: "declining",
      title: "NeuroSpace — Odak düşüşte",
      message:
        report.recommendation ||
        "Son ölçümlerde düşüş eğilimi var. Kısa bir nefes molası iyi gelebilir.",
    };
  }
  // Kötüden iyiye dönüş: olumlu pekiştirme
  if (report.status === "RECOVERING") {
    return {
      kind: "recovering",
      title: "NeuroSpace — Toparlanıyorsunuz",
      message:
        report.recommendation ||
        "Tempo yeniden yükseliyor. Aynı şekilde devam edin.",
    };
  }
  // Uzun süre akışta (art arda yüksek OPTIMAL): olumlu pekiştirme
  if (report.status === "OPTIMAL" && flowStreak >= 4) {
    return {
      kind: "flow",
      title: "NeuroSpace — Akıştasınız",
      message:
        report.recommendation ||
        "Uzun süredir yüksek odakta yazıyorsunuz. Harika gidiyor!",
    };
  }
  return null;
}

async function maybeNotify(report, sourceTabId) {
  const sync = await chrome.storage.sync.get(["notificationsEnabled"]);
  if (sync.notificationsEnabled === false) return; // varsayılan: açık

  // Art arda OPTIMAL sayacı (akış serisi) — flow bildirimi için
  const store = await chrome.storage.local.get(["flowStreak", "notifyTimes"]);
  let flowStreak = store.flowStreak || 0;
  flowStreak = report.status === "OPTIMAL" ? flowStreak + 1 : 0;
  await chrome.storage.local.set({ flowStreak });

  const choice = pickNotification(report, flowStreak);
  if (!choice) return;

  // Tip bazlı cooldown
  const times = store.notifyTimes || {};
  const last = times[choice.kind] || 0;
  if (Date.now() - last < COOLDOWN[choice.kind]) return;

  try {
    chrome.notifications.create(`ns_${choice.kind}`, {
      type: "basic",
      iconUrl: "icon128.png",
      title: choice.title,
      message: choice.message,
      priority: choice.kind === "fatigue" ? 2 : 1,
    });
    times[choice.kind] = Date.now();
    await chrome.storage.local.set({ notifyTimes: times });
  } catch (_e) {
    // Bildirim API'si yoksa sessizce geç.
  }

  // Ölçümün geldiği sekmeye üst banner göster (sayfa içi görsel bildirim).
  // Test bildirimi veya retry queue gibi sekme bilgisi olmayan durumlarda aktif sekmeye düşer.
  showBannerInTab(report, choice.message, sourceTabId);
}

// Content script'e banner mesajı yollar.
async function showBannerInTab(report, message, sourceTabId) {
  try {
    let tabId = sourceTabId;
    if (!tabId) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = tab?.id;
      if (!tabId || !/^https?:/.test(tab?.url || "")) return; // yalnızca web sayfaları
    }
    chrome.tabs.sendMessage(tabId, {
      type: "NS_SHOW_BANNER",
      report: {
        status: report.status,
        recommendation: message || report.recommendation,
      },
    });
  } catch (_e) {
    // Sekme erişilemezse sessizce geç.
  }
}

// ---- Retry queue -----------------------------------------------------------
async function enqueue(summary) {
  const { [QUEUE_KEY]: queue = [] } = await chrome.storage.local.get(QUEUE_KEY);
  queue.push({ summary, queuedAt: Date.now() });
  // Kuyruğu sınırla — eskileri at (kısa süreli saklama ilkesi).
  while (queue.length > MAX_QUEUE_SIZE) queue.shift();
  await chrome.storage.local.set({ [QUEUE_KEY]: queue });
  chrome.alarms.create(RETRY_ALARM, { delayInMinutes: 2 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== RETRY_ALARM) return;
  const cfg = await getConfig();
  if (cfg.apiBaseUrl && cfg.accessToken) {
    cfg.accessToken = await ensureFreshToken(cfg);
  }
  const { [QUEUE_KEY]: queue = [] } = await chrome.storage.local.get(QUEUE_KEY);
  const now = Date.now();
  const fresh = queue.filter((i) => now - i.queuedAt < MAX_ITEM_AGE_MS);

  const remaining = [];
  for (const item of fresh) {
    const ok =
      cfg.apiBaseUrl && cfg.accessToken
        ? await sendToApi(cfg, item.summary)
        : false;
    if (!ok) remaining.push(item);
  }
  await chrome.storage.local.set({ [QUEUE_KEY]: remaining });
  if (remaining.length > 0) {
    chrome.alarms.create(RETRY_ALARM, { delayInMinutes: 5 });
  }
});

// ---- Varsayılan ayarlar ------------------------------------------------------
chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.sync.get([
    "trackingEnabled",
    "excludedDomains",
  ]);
  await chrome.storage.sync.set({
    trackingEnabled: cur.trackingEnabled !== false,
    excludedDomains: cur.excludedDomains || [],
  });
});
