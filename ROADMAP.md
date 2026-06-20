# NeuroSpace — Geliştirme Yol Haritası

> Son güncelleme: 2026-06-13
> Canlı: https://web-psi-five-hpxjfd2q8m.vercel.app
> Supabase proje: kqxyzqclbrvaezvxpqcm

Bu dosya, projenin geliştirme durumunu ve sonraki adımları takip eder.
Her oturumda buradan devam edilir.

---

## Mimari özet

- **extension/** — Chrome MV3 eklentisi (içerik asla kaydedilmez, yalnızca anonim ritim metrikleri)
- **web/** — Next.js 14 + React + Tailwind + Recharts paneli + API
- **supabase/migrations/** — SQL şema + RLS + trigger'lar

---

## TAMAMLANANLAR (canlı, test edildi)

### Çekirdek (MVP)
- [x] Chrome eklentisi: keydown ölçümü, hassas alan engeli, 3 dk pencere özeti
- [x] Privacy-first: karakter saklanmaz, `element.value` okunmaz, sunucu whitelist validation
- [x] `incognito: not_allowed`, HTTPS-only gönderim, retry queue
- [x] Web panel: login, dashboard, günlük/haftalık analiz, ayarlar, gizlilik
- [x] Supabase: 5 tablo + RLS (kullanıcı izolasyonu) + auto-profil trigger
- [x] Analiz motoru: status (6 durum) + 0-100 skor (ağırlık 40/30/20/10)
- [x] Demo-data fallback (giriş yokken)
- [x] Vercel deploy + env + uçtan uca canlı test

### Faz 3 — Değer katan özellikler
- [x] **Eklentide doğrudan giriş** (email/şifre → token; kopyala-yapıştır kalktı)
- [x] **Token otomatik yenileme** (refresh_token; saatlik token ölümü çözüldü)
- [x] `/api/public-config` endpoint (eklenti için public Supabase config)
- [x] **Zaman-bağlamlı baseline** (4 dilim: sabah/öğlen/akşam/gece; her biri ayrı kalibre)
  - migration `0002_time_contextual_baseline.sql`
- [x] **Yorgunluk bildirimleri** (gradyan ikonlar + throttle)

### Faz 1 — Yasal & güven
- [x] **Açık rıza sistemi** (`ConsentGate` + `/api/account/consent`)
  - migration `0003_consent.sql`
- [x] **Veri indir** (`/api/account/export` — JSON)
- [x] **Veri/hesap silme** (`/api/account/delete` — mode: data/account)
- [x] KVKK/GDPR aydınlatma metni + "tıbbi araç değildir" disclaimer (privacy sayfası)

### Trend & analiz geliştirme
- [x] **Trend/anomali tespiti** (least-squares eğim; declining/recovering/stable)
  - Erken uyarı: risk eşiği aşılmadan düşüş trendinde uyarı
  - Çelişki bug'ı düzeltildi (RECOVERING'de "düşüştesin" demiyor)
- [x] **Zenginleştirilmiş bildirimler** (4 tip, tip bazlı cooldown):
  - FATIGUED (20dk), declining (15dk), RECOVERING (30dk), flow/OPTIMAL (60dk)
- [x] **Analiz motoru testleri** — `npm test`, 16/16 geçiyor (node --test + tsx)
- [x] **Dashboard trend rozeti** (↗ Yükselişte / ↘ Düşüşte / → Stabil)

### Test araçları
- [x] Popup'ta test butonları (FATIGUED/WARNING/RECOVERING/OPTIMAL tetikleme)
- [x] **Üst banner bildirimi** (content.js — tam genişlik, kayarak inen, renkli, 8sn)
  - NOT: aşağıdaki "bilinen sorun" maddesine bak

### Bakım
- [x] Test ayarları production'a geri alındı:
  - `content.js` WINDOW_MS = 3 dk
  - `analysis-engine.ts` MIN_SAMPLES = 20, CALIBRATION_WINDOWS = 10

---

## BİLİNEN SORUNLAR / YARIM KALANLAR

### 1. Üst banner açık sekmelerde çıkmıyor (ÖNCELİK: orta)
- **Sorun:** Banner content.js'e bağlı. Eklenti yenilenince zaten açık sekmeler
  ESKİ content.js'i çalıştırır; yeni banner dinleyicisi yoktur. Bu yüzden test
  edince sadece OS bildirimi (sağ alt) çıkıyor, üst banner çıkmıyor.
- **Geçici çözüm:** Test edilecek web sayfasını da F5 ile yenile.
- **Kalıcı çözüm (YAPILACAK):** Banner'ı service worker'dan `chrome.scripting`
  ile doğrudan enjekte et (content script'e bağımlı olma). Manifest'e
  `scripting` izni eklenecek. Böylece sekme yenilenmese de çalışır.

### 2. Test butonları production'da görünür (ÖNCELİK: yayın öncesi)
- Popup'taki test butonları gerçek kullanıcıya görünmemeli.
- Yayından önce kaldır veya bir "geliştirici modu" arkasına gizle.

---

## SIRADAKİ ADIMLAR (öncelik sırasız, seçilecek)

### Yayın için gerekli (Faz 2'den kalan)
- [ ] **API rate limiting** (typing-window endpoint kötüye kullanıma açık)
- [ ] Banner'ı `chrome.scripting` ile sağlamlaştır (bilinen sorun #1)
- [ ] Test butonlarını gizle/kaldır (bilinen sorun #2)
- [ ] Chrome Web Store hazırlığı: privacy policy URL, izin gerekçeleri,
  `host_permissions: https://*/*` açıklaması

### Analiz derinleştirme
- [ ] Bilimsel eşik kalibrasyonu (şu anki eşikler sezgisel — veri/araştırma işi)
- [ ] Baseline'ı zamanla güncelleme (kayan ortalama; kullanıcı geliştikçe baseline kayar)

### Dashboard görsel zenginleştirme
- [ ] Skor için animasyonlu gauge
- [ ] Haftalık ısı haritası (gün × saat)
- [ ] Dilim bazında karşılaştırma görünümü (sabah vs akşam)

### Bildirim geliştirme
- [ ] Banner'a aksiyon butonu ("Mola başlat" → mola sayacı)
- [ ] Bildirim sıklığı kullanıcı tercihi (sessiz saatler)

---

## YASAL NOT (önemli)
- Keystroke dynamics'in biyometrik veri sayılıp sayılmadığı kaynaklı olarak
  DOĞRULANMADI (web araması ortamda çalışmadı).
- Kurulan model "en güvenli" yaklaşım: açık opt-in rıza + şeffaflık + silme/indirme.
- Kullanıcı (sen) yayından önce avukat görüşü almamayı / riski kabul etmeyi seçti.
- Yayın öncesi tekrar değerlendirilmeli.

---

## ÇALIŞTIRMA NOTLARI
- Web dev: `cd web && npm run dev`
- Testler: `cd web && npm test`
- Build: `cd web && npm run build`
- Deploy: `cd web && vercel --prod --yes`
- Eklenti: `chrome://extensions` → geliştirici modu → paketlenmemiş yükle → `extension/`
- Eklenti kodu değişince: extensions sayfasından ↻ yenile + test sayfasını F5
- Migration'lar Supabase SQL Editor'den elle çalıştırılıyor (0001, 0002, 0003 uygulandı)
