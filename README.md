# NeuroSpace

Gizlilik odaklı odak/yorgunluk analizi için tarayıcı eklentisi + web paneli.

NeuroSpace **ne yazdığınızı değil, nasıl yazdığınızın ritmini** ölçer. Yazdığınız
hiçbir karakter, kelime veya metin kaydedilmez. Yalnızca tuşlar arası süre, toplam
tuş sayısı ve Backspace oranı gibi **anonim metrikler** analiz edilerek bilişsel
enerji/odak skoru üretilir.

## Mimari

```
neurospace/
├── extension/                 # Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── content.js             # Tuş ritmi ölçümü (içerik ASLA okunmaz)
│   ├── service_worker.js      # Özet gönderimi + retry queue
│   ├── popup.html / popup.js  # Skor + aç/kapat
│   └── options.html/.js       # API adresi, token, takip dışı siteler
│
├── web/                       # Next.js 14 + React + Tailwind + Recharts
│   ├── src/app/
│   │   ├── login/             # Supabase Auth (giriş/kayıt)
│   │   ├── dashboard/         # Kart tabanlı özet + grafikler
│   │   ├── analytics/daily/   # Gün içi grafikler
│   │   ├── analytics/weekly/  # Haftalık trend
│   │   ├── settings/          # Takip tercihleri
│   │   ├── privacy/           # Gizlilik açıklaması
│   │   └── api/typing-window/ # POST endpoint + analiz tetikleme
│   └── src/lib/
│       ├── analysis-engine.ts # Skor + status hesaplama
│       ├── validation.ts      # Whitelist payload doğrulama
│       ├── demo-data.ts       # Supabase yoksa demo grafikler
│       └── supabase/          # client (tarayıcı) + server (API/RLS)
│
└── supabase/
    └── migrations/0001_init.sql  # 5 tablo + RLS + auto-profil trigger
```

## Veri akışı

1. Eklenti içerik scripti, editable alanlarda `keydown` olaylarını dinler.
2. Tuşun **karakter değeri okunmaz**; yalnızca "üretken / düzeltme / yok say"
   sınıflandırması yapılır ve hemen unutulur.
3. 3 dakikalık pencere içinde sayısal metrikler toplanır:
   `mean_flight_ms`, `median_flight_ms`, `p95_flight_ms`,
   `backspace_percentage`, `total_samples`, `active_typing_seconds`,
   `pause_ratio`.
4. Pencere sonunda **yalnızca bu özet** HTTPS üzerinden `POST /api/typing-window`
   adresine gider.
5. API token'ı doğrular, veriyi `typing_windows`'a yazar, baseline hazırsa analiz
   motorunu çalıştırır, sonucu `analysis_reports`'a kaydeder ve
   `{ status, score, recommendation }` döner.

## Analiz motoru

- `total_samples < 20` → `INSUFFICIENT_DATA`
- `flightDeviation = mean_flight_ms / baseline.avgFlightTime` (≥1.25 → yavaşlama riski)
- `backspaceDeviation = backspace_percentage / baseline.backspaceRatio` (≥1.4 → backspace riski)
- İki risk birlikte → `FATIGUED`; biri → `WARNING`; hiçbiri ve skor≥80 → `OPTIMAL`
- Önceki pencere kötüyken bu pencere iyiyse → `RECOVERING`
- **Ağırlıklı skor (0-100):** yazma hızı %40, backspace %30, duraklama %20,
  veri güvenilirliği %10

## Kurulum

### 1. Supabase

1. [supabase.com](https://supabase.com) üzerinde yeni proje oluşturun.
2. SQL Editor'de `supabase/migrations/0001_init.sql` dosyasını çalıştırın.
3. Authentication > Providers altında Email'i etkinleştirin.
4. Project Settings > API'den `URL` ve `anon key`'i alın.

### 2. Web paneli

```bash
cd web
cp .env.example .env.local      # URL ve anon key'i doldurun
npm install
npm run dev                     # http://localhost:3000
```

> Env değişkenleri boş bırakılırsa panel **demo modunda** çalışır (örnek grafiklerle).

### 3. Chrome eklentisi

1. `chrome://extensions` → "Geliştirici modu" açık.
2. "Paketlenmemiş öğe yükle" → `extension/` klasörünü seçin.
3. Eklenti **Ayarlar** sayfasını açın:
   - **API / Panel adresi**: dağıtım adresiniz (HTTPS) veya yerel tünel.
   - **Erişim anahtarı**: panelde giriş yaptıktan sonra gösterilen access token.
   - İsteğe bağlı: takip dışı siteler.

> Yerel geliştirmede `http://localhost` HTTPS olmadığı için eklenti gönderim
> yapmaz; uçtan uca testte paneli HTTPS bir adrese (ör. Vercel) dağıtın.

## MVP çalıştırma (en hızlı yol)

```bash
cd web && npm install && npm run dev
```

`http://localhost:3000/dashboard` → demo verisiyle dolu panel. Supabase ve eklenti
olmadan tüm sayfalar ve grafikler çalışır.

## Gizlilik notları

Ayrıntılar için `PRIVACY.md` dosyasına bakın. Özet:

- Karakter/kelime/metin **asla** saklanmaz.
- Sunucuya yalnızca 3 dakikalık özet gider; ham tuş listesi gönderilmez.
- Şifre, kredi kartı, OTP ve ödeme alanlarında ölçüm devre dışıdır.
- Gizli pencerede eklenti varsayılan olarak çalışmaz (`incognito: not_allowed`).
- Veri yalnızca HTTPS üzerinden aktarılır.
- Row Level Security ile her kullanıcı yalnızca kendi verisine erişir.
