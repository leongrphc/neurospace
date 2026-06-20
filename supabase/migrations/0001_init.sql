-- ============================================================================
-- NeuroSpace - Supabase Şeması (0001_init.sql)
-- GİZLİLİK: Hiçbir tabloda metin içeriği, tuş listesi veya site adresi yoktur.
-- Yalnızca anonim sayısal yazma ritmi özetleri saklanır.
-- ============================================================================

-- ---------- users (profil) ---------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- ---------- user_settings ----------------------------------------------------
create table if not exists public.user_settings (
  user_id uuid primary key references public.users (id) on delete cascade,
  tracking_enabled boolean not null default true,
  incognito_enabled boolean not null default false, -- gizli pencere varsayılan KAPALI
  updated_at timestamptz not null default now()
);

-- ---------- baselines --------------------------------------------------------
create table if not exists public.baselines (
  user_id uuid primary key references public.users (id) on delete cascade,
  avg_flight_ms double precision,
  median_flight_ms double precision,
  backspace_ratio double precision,   -- yüzde (örn. 5.0)
  pause_ratio double precision,       -- 0..1
  sample_windows integer not null default 0,
  is_ready boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------- typing_windows (3 dakikalık özetler) ------------------------------
create table if not exists public.typing_windows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  window_started_at timestamptz not null,
  window_ended_at timestamptz not null,
  mean_flight_ms double precision not null check (mean_flight_ms >= 0),
  median_flight_ms double precision not null check (median_flight_ms >= 0),
  p95_flight_ms double precision not null check (p95_flight_ms >= 0),
  backspace_percentage double precision not null
    check (backspace_percentage between 0 and 100),
  total_samples integer not null check (total_samples >= 0),
  active_typing_seconds integer not null check (active_typing_seconds >= 0),
  pause_ratio double precision not null check (pause_ratio between 0 and 1),
  created_at timestamptz not null default now()
);

create index if not exists typing_windows_user_time_idx
  on public.typing_windows (user_id, created_at desc);

-- ---------- analysis_reports ---------------------------------------------------
create table if not exists public.analysis_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  typing_window_id uuid references public.typing_windows (id) on delete cascade,
  status text not null check (status in (
    'INSUFFICIENT_DATA', 'OPTIMAL', 'SLIGHTLY_DISTRACTED',
    'WARNING', 'FATIGUED', 'RECOVERING'
  )),
  score integer check (score between 0 and 100),
  recommendation text,
  created_at timestamptz not null default now()
);

create index if not exists analysis_reports_user_time_idx
  on public.analysis_reports (user_id, created_at desc);

-- ============================================================================
-- Row Level Security: kullanıcı bazlı tam veri izolasyonu
-- Her kullanıcı YALNIZCA kendi satırlarını okuyup yazabilir.
-- ============================================================================
alter table public.users enable row level security;
alter table public.user_settings enable row level security;
alter table public.baselines enable row level security;
alter table public.typing_windows enable row level security;
alter table public.analysis_reports enable row level security;

-- users
create policy "users_select_own" on public.users
  for select using (auth.uid() = id);
create policy "users_update_own" on public.users
  for update using (auth.uid() = id);

-- user_settings
create policy "settings_select_own" on public.user_settings
  for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.user_settings
  for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.user_settings
  for update using (auth.uid() = user_id);

-- baselines
create policy "baselines_select_own" on public.baselines
  for select using (auth.uid() = user_id);
create policy "baselines_insert_own" on public.baselines
  for insert with check (auth.uid() = user_id);
create policy "baselines_update_own" on public.baselines
  for update using (auth.uid() = user_id);

-- typing_windows
create policy "windows_select_own" on public.typing_windows
  for select using (auth.uid() = user_id);
create policy "windows_insert_own" on public.typing_windows
  for insert with check (auth.uid() = user_id);
create policy "windows_delete_own" on public.typing_windows
  for delete using (auth.uid() = user_id);

-- analysis_reports
create policy "reports_select_own" on public.analysis_reports
  for select using (auth.uid() = user_id);
create policy "reports_insert_own" on public.analysis_reports
  for insert with check (auth.uid() = user_id);

-- ============================================================================
-- Yeni auth kullanıcısı için otomatik profil + ayar satırı
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
