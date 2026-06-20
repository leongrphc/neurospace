/**
 * NeuroSpace Popup
 * - Güncel takip durumunu, son skoru ve aç/kapat butonunu gösterir.
 * GİZLİLİK: Popup yalnızca anonim özet rapor (status/score) okur.
 */

const STATUS_LABELS = {
  INSUFFICIENT_DATA: "Yetersiz veri",
  OPTIMAL: "Optimal",
  SLIGHTLY_DISTRACTED: "Hafif dağınık",
  WARNING: "Uyarı",
  FATIGUED: "Yorgun",
  RECOVERING: "Toparlanıyor",
};

const scoreEl = document.getElementById("score");
const statusEl = document.getElementById("status");
const recEl = document.getElementById("recommendation");
const toggleEl = document.getElementById("trackingToggle");
const authWarnEl = document.getElementById("authWarn");

// Takip durumunu yükle
chrome.storage.sync.get(["trackingEnabled"], (data) => {
  toggleEl.checked = data.trackingEnabled !== false;
});

// Aç/kapat
toggleEl.addEventListener("change", () => {
  chrome.storage.sync.set({ trackingEnabled: toggleEl.checked });
});

// Son raporu al ve göster
chrome.runtime.sendMessage({ type: "NS_GET_STATUS" }, (data) => {
  if (chrome.runtime.lastError) return;

  if (data?.authExpired) {
    authWarnEl.style.display = "block";
  }

  const report = data?.lastReport;
  if (report && typeof report.score === "number") {
    scoreEl.textContent = report.status === "INSUFFICIENT_DATA" ? "--" : report.score;
    statusEl.textContent = STATUS_LABELS[report.status] || report.status;
    recEl.textContent = report.recommendation || "";

    const color =
      report.score >= 70 ? "#22c55e" : report.score >= 50 ? "#eab308" : "#ef4444";
    if (report.status !== "INSUFFICIENT_DATA") scoreEl.style.color = color;
  }
});

// Sayfa linkleri
document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("openDashboard").addEventListener("click", async () => {
  const { apiBaseUrl } = await chrome.storage.sync.get(["apiBaseUrl"]);
  const url = apiBaseUrl ? `${apiBaseUrl}/dashboard` : "https://neurospace.app/dashboard";
  chrome.tabs.create({ url });
});

// Test butonları: seçilen durumu tetikler (bildirim + rozet + skor).
// Yalnızca deneme amaçlıdır; sunucuya gerçek veri göndermez.
const testHint = document.getElementById("testHint");
document.querySelectorAll(".test-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const status = btn.getAttribute("data-status");
    testHint.textContent = "Tetikleniyor...";
    chrome.runtime.sendMessage({ type: "NS_TEST_NOTIFY", status }, (res) => {
      if (chrome.runtime.lastError) {
        testHint.textContent = "Hata: service worker yanıt vermedi.";
        return;
      }
      testHint.textContent = res?.ok
        ? `${status} tetiklendi — bildirimi kontrol edin.`
        : "Tetiklenemedi.";
      // Skor/durumu popup'ta da güncelle
      refreshStatus();
    });
  });
});

// Son raporu yeniden çekip popup'ı güncelle (test sonrası anlık görsel)
function refreshStatus() {
  chrome.runtime.sendMessage({ type: "NS_GET_STATUS" }, (data) => {
    if (chrome.runtime.lastError) return;
    const report = data?.lastReport;
    if (report && typeof report.score === "number") {
      scoreEl.textContent =
        report.status === "INSUFFICIENT_DATA" ? "--" : report.score;
      statusEl.textContent = STATUS_LABELS[report.status] || report.status;
      recEl.textContent = report.recommendation || "";
      const color =
        report.score >= 70 ? "#22c55e" : report.score >= 50 ? "#eab308" : "#ef4444";
      if (report.status !== "INSUFFICIENT_DATA") scoreEl.style.color = color;
    }
  });
}

