-- ============================================================================
-- NeuroSpace - Migration 0002: Zaman-bağlamlı baseline
-- Amaç: Sabah dinç hâl ile akşam yorgun hâli aynı baseline'a göre ölçmemek.
-- Günü 4 dilime ayırır (morning/afternoon/evening/night) ve her dilim için
-- ayrı baseline tutar. Geriye dönük uyumlu: eski tek-baseline 'all' olur.
-- ============================================================================

-- 1) typing_windows: pencerenin yerel saat dilimi
alter table public.typing_windows
  add column if not exists local_hour smallint
    check (local_hour is null or local_hour between 0 and 23);

-- 2) baselines: time_bucket boyutu ekle ve birincil anahtarı genişlet
alter table public.baselines
  add column if not exists time_bucket text not null default 'all'
    check (time_bucket in ('all', 'morning', 'afternoon', 'evening', 'night'));

-- Eski PK (yalnızca user_id) yerine (user_id, time_bucket)
alter table public.baselines drop constraint if exists baselines_pkey;
alter table public.baselines
  add constraint baselines_pkey primary key (user_id, time_bucket);

-- 3) analysis_reports: hangi dilime göre değerlendirildiğini sakla (şeffaflık)
alter table public.analysis_reports
  add column if not exists time_bucket text
    check (time_bucket is null or time_bucket in
      ('all', 'morning', 'afternoon', 'evening', 'night'));

-- RLS politikaları 0001'de zaten (user_id) bazlı tanımlı; yeni sütunlar
-- aynı politikalar altında korunur, ek policy gerekmez.
