-- ============================================================================
-- NeuroSpace - Migration 0005: Ek ritim sinyalleri
-- Amaç: Yorgunluk/dağınıklık tespitini güçlendiren iki yeni anonim metrik.
--  - flight_cv: yazma ritmi tutarsızlığı (std/mean). Yorgunlukta ritim
--    yavaşlamakla kalmaz, DÜZENSİZLEŞİR. Yüksek değer = düzensiz ritim.
--  - backspace_burst_ratio: ardışık silme serilerinin toplam silmeye oranı.
--    Tek tük düzeltme yerine peş peşe silme = dağınıklık sinyali.
-- GİZLİLİK: İkisi de tek sayısal orandır; ham tuş/karakter verisi içermez.
-- Geriye uyumlu: eski eklenti göndermezse alanlar NULL/0 kalır.
-- ============================================================================

alter table public.typing_windows
  add column if not exists flight_cv double precision
    check (flight_cv is null or flight_cv >= 0);

alter table public.typing_windows
  add column if not exists backspace_burst_ratio double precision
    check (backspace_burst_ratio is null or backspace_burst_ratio between 0 and 1);

-- RLS politikaları 0001'de (user_id) bazlı tanımlı; yeni sütunlar aynı
-- politikalar altında korunur, ek policy gerekmez.
