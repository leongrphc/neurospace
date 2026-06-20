# NeuroSpace Gizlilik Notları

NeuroSpace'in tek amacı, **yazdığınız içeriği görmeden** yazma ritminizden odak ve
yorgunluk sinyali çıkarmaktır. Bu belge, sistemin neyi topladığını ve neyi
**asla** toplamadığını açıklar.

## Asla toplanmaz

- Yazdığınız karakterler, harfler, kelimeler veya cümleler
- Input alanlarının içeriği — `element.value` kodun hiçbir yerinde okunmaz
- Ham tuş listesi veya bireysel zaman damgası dizileri
- Hangi karakterin yazıldığı/silindiği bilgisi (Backspace yalnızca bir sayaçtır)
- Ziyaret ettiğiniz sayfaların URL'leri veya başlıkları

## Yalnızca bunlar ölçülür (anonim, sayısal)

| Metrik | Açıklama |
|---|---|
| `mean_flight_ms` | İki geçerli tuş arası ortalama süre |
| `median_flight_ms` | Medyan tuş arası süre |
| `p95_flight_ms` | 95. yüzdelik tuş arası süre |
| `backspace_percentage` | Backspace oranı (yalnızca yüzde) |
| `total_samples` | Geçerli örnek sayısı |
| `active_typing_seconds` | Aktif yazma süresi |
| `pause_ratio` | Duraklama oranı (0..1) |

Bu özet 3 dakikalık pencereler halinde üretilir ve sunucuya **yalnızca bu özet**
gönderilir.

## Teknik güvenceler

1. **Karakter izolasyonu** — `content.js` içinde `event.key`, yalnızca tuşun
   "üretken / düzeltme / yok say" kategorisini belirlemek için okunur ve hiçbir
   değişkene karakter olarak yazılmaz.
2. **Hassas alan engeli** — `password`, `tel`, `hidden` tipleri; `cc-*`,
   `one-time-code` autocomplete değerleri; ve `password / card / cvv / otp /
   payment / iban / ssn / tckn` gibi desenleri içeren `name/id/placeholder`
   alanlarında ölçüm **tamamen** durur.
3. **Sadece HTTPS** — Service worker, `https://` ile başlamayan adreslere veri
   göndermez.
4. **Gizli pencere kapalı** — `manifest.json` içinde `"incognito": "not_allowed"`.
5. **Sunucu tarafı whitelist** — `validation.ts`, beklenen sayısal alanlar
   dışındaki her şeyi düşürür; yanlışlıkla ham veri gönderilse bile saklanmaz.
6. **Kullanıcı izolasyonu** — Tüm tablolar Row Level Security ile korunur; her
   kullanıcı yalnızca kendi `user_id` satırlarına erişebilir. Service role key
   kullanılmaz; erişim kullanıcının kendi JWT'si üzerinden yapılır.

## Kullanıcı kontrolü

- Takip, eklenti popup'ından tek tuşla açılıp kapatılabilir.
- Belirli siteler eklenti Ayarlar sayfasından takip dışı bırakılabilir.
- Erişim anahtarı yalnızca cihazda (`chrome.storage.local`) saklanır, senkronize
  edilmez.
