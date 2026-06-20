-- ============================================================================
-- NeuroSpace - Migration 0004: Güven (confidence) seviyesi
-- Amaç: Her analiz raporunun ne kadar güvenilir olduğunu saklamak.
-- Baseline olgunluğu (sample_windows) + pencere örnek sayısına dayanır.
-- Dashboard ve bildirimler düşük güvende daha ihtiyatlı dil kullanır.
-- ============================================================================

alter table public.analysis_reports
  add column if not exists confidence text
    check (confidence is null or confidence in ('low', 'medium', 'high'));

-- RLS politikaları 0001'de (user_id) bazlı tanımlı; yeni sütun aynı
-- politikalar altında korunur, ek policy gerekmez.
