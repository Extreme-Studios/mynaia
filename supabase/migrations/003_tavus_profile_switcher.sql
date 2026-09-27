-- Application setting holds only the active profile number; never API keys.
create table if not exists public.naya_app_settings (
  setting_key text primary key,
  setting_value text not null,
  updated_at timestamptz not null default now()
);
alter table public.naya_app_settings enable row level security;
revoke all on public.naya_app_settings from anon, authenticated;
grant select, insert, update on public.naya_app_settings to service_role;
insert into public.naya_app_settings(setting_key, setting_value)
values ('tavus_active_profile', '1')
on conflict (setting_key) do nothing;

alter table public.naya_conversation_sessions
  add column if not exists tavus_profile_used integer not null default 1
  check (tavus_profile_used between 1 and 8);
create index if not exists naya_sessions_tavus_profile_idx
  on public.naya_conversation_sessions(tavus_profile_used, started_at desc);
