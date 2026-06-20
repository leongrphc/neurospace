-- ============================================================================
-- NeuroSpace - Migration 0003: Açık rıza (KVKK/GDPR) kayıtları
-- Amaç: Kullanıcının aydınlatma metnini görüp açık rıza verdiğini, ne zaman
-- ve hangi metin sürümüyle verdiğini kanıtlanabilir biçimde saklamak.
-- ============================================================================

alter table public.user_settings
  add column if not exists consent_given boolean not null default false,
  add column if not exists consent_at timestamptz,
  add column if not exists consent_version text;

-- Not: RLS politikaları 0001'de (user_id) bazlı tanımlı; yeni sütunlar aynı
-- politikalar altında korunur. Kullanıcı yalnızca kendi rıza kaydını
-- okuyup güncelleyebilir.
