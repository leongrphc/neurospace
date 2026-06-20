/**
 * NeuroSpace Options
 * - API adresi, hesap girişi, takip durumu ve takip dışı siteler.
 *
 * GİZLİLİK/GÜVENLİK:
 *  - E-posta/şifre yalnızca giriş anında Supabase Auth'a gönderilir, ASLA
 *    saklanmaz.
 *  - Yalnızca oturum anahtarları (access + refresh token) bu cihazda
 *    (chrome.storage.local) tutulur; senkronize EDİLMEZ.
 *  - Supabase URL + anon key panelin public-config endpoint'inden alınır
 *    (bunlar zaten public değerlerdir).
 */

const apiBaseUrlEl = document.getElementById("apiBaseUrl");
const trackingEnabledEl = document.getElementById("trackingEnabled");
const notificationsEnabledEl = document.getElementById("notificationsEnabled");
const excludedDomainsEl = document.getElementById("excludedDomains");
const savedEl = document.getElementById("saved");

const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const authMsgEl = document.getElementById("authMsg");
const loggedOutEl = document.getElementById("loggedOut");
const loggedInEl = document.getElementById("loggedIn");
const accountEmailEl = document.getElementById("accountEmail");

// ---- Ayarları yükle --------------------------------------------------------
async function loadSettings() {
  const sync = await chrome.storage.sync.get([
    "apiBaseUrl",
    "trackingEnabled",
    "notificationsEnabled",
    "excludedDomains",
  ]);
  apiBaseUrlEl.value = sync.apiBaseUrl || "";
  trackingEnabledEl.checked = sync.trackingEnabled !== false;
  notificationsEnabledEl.checked = sync.notificationsEnabled !== false;
  excludedDomainsEl.value = (sync.excludedDomains || []).join("\n");

  await refreshAuthUI();
}

async function refreshAuthUI() {
  const { accessToken, accountEmail } = await chrome.storage.local.get([
    "accessToken",
    "accountEmail",
  ]);
  const loggedIn = Boolean(accessToken);
  loggedOutEl.style.display = loggedIn ? "none" : "block";
  loggedInEl.style.display = loggedIn ? "block" : "none";
  if (loggedIn) accountEmailEl.textContent = accountEmail || "Hesap";
}

function normalizeDomains(raw) {
  return raw
    .split("\n")
    .map((d) =>
      d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "")
    )
    .filter(Boolean);
}

function getApiBaseUrl() {
  return apiBaseUrlEl.value.trim().replace(/\/$/, "");
}

// ---- Panelden public Supabase config al ------------------------------------
async function fetchSupabaseConfig(apiBaseUrl) {
  const res = await fetch(`${apiBaseUrl}/api/public-config`);
  if (!res.ok) throw new Error("Panel yapılandırması alınamadı.");
  const cfg = await res.json();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    throw new Error("Panel Supabase için yapılandırılmamış.");
  }
  return cfg;
}

// ---- Giriş -----------------------------------------------------------------
document.getElementById("login").addEventListener("click", async () => {
  authMsgEl.style.color = "";
  authMsgEl.textContent = "Giriş yapılıyor...";

  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl.startsWith("https://")) {
    authMsgEl.style.color = "#ef4444";
    authMsgEl.textContent = "Önce geçerli bir HTTPS panel adresi girin.";
    return;
  }

  try {
    const cfg = await fetchSupabaseConfig(apiBaseUrl);

    // Supabase Auth: e-posta/şifre ile token al
    const res = await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: cfg.supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: emailEl.value.trim(),
        password: passwordEl.value,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.access_token) {
      throw new Error(data.error_description || data.msg || "Giriş başarısız.");
    }

    // Önce API adresini sync'e kaydet (service worker burayı okur)
    await chrome.storage.sync.set({ apiBaseUrl });

    // Oturum anahtarları + yenileme için gerekli config yalnızca LOCAL'de
    await chrome.storage.local.set({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
      supabaseUrl: cfg.supabaseUrl,
      supabaseAnonKey: cfg.supabaseAnonKey,
      accountEmail: emailEl.value.trim(),
      authExpired: false,
    });

    // GÜVENLİK: şifreyi DOM'dan hemen temizle
    passwordEl.value = "";
    authMsgEl.style.color = "#22c55e";
    authMsgEl.textContent = "Giriş başarılı.";
    await refreshAuthUI();
  } catch (err) {
    authMsgEl.style.color = "#ef4444";
    authMsgEl.textContent = err.message || "Giriş sırasında hata oluştu.";
  }
});

// ---- Çıkış -----------------------------------------------------------------
document.getElementById("logout").addEventListener("click", async () => {
  await chrome.storage.local.remove([
    "accessToken",
    "refreshToken",
    "tokenExpiresAt",
    "accountEmail",
    "authExpired",
  ]);
  await refreshAuthUI();
});

// ---- Diğer ayarları kaydet -------------------------------------------------
document.getElementById("save").addEventListener("click", async () => {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl && !apiBaseUrl.startsWith("https://")) {
    alert("API adresi yalnızca HTTPS olabilir.");
    return;
  }

  await chrome.storage.sync.set({
    apiBaseUrl,
    trackingEnabled: trackingEnabledEl.checked,
    notificationsEnabled: notificationsEnabledEl.checked,
    excludedDomains: normalizeDomains(excludedDomainsEl.value),
  });

  savedEl.classList.add("show");
  setTimeout(() => savedEl.classList.remove("show"), 1500);
});

loadSettings();
