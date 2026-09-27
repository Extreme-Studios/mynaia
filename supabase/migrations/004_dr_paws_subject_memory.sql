-- Dr. Paws memory is scoped by subject UUID. Existing Naya rows remain untouched.
create table if not exists public.naya_subjects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null references public.naya_users(id),
  display_name text not null check (char_length(display_name) between 1 and 80),
  nickname text check (nickname is null or char_length(nickname) <= 80),
  memory_reset_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists naya_subjects_owner_idx on public.naya_subjects(owner_user_id, created_at);

alter table public.naya_conversation_sessions add column if not exists subject_id uuid references public.naya_subjects(id);
alter table public.naya_session_summaries add column if not exists subject_id uuid references public.naya_subjects(id);
alter table public.naya_memories add column if not exists subject_id uuid references public.naya_subjects(id);
alter table public.naya_open_loops add column if not exists subject_id uuid references public.naya_subjects(id);

-- Preserve archived Dr. Paws sessions: one legacy subject per owner, created only if needed.
insert into public.naya_subjects (owner_user_id, display_name)
select distinct s.user_id, 'Profil lama' from public.naya_conversation_sessions s
where s.mode = 'dr_paws' and s.subject_id is null
  and not exists (select 1 from public.naya_subjects p where p.owner_user_id = s.user_id);
update public.naya_conversation_sessions s set subject_id = p.id
from (select distinct on (owner_user_id) id, owner_user_id from public.naya_subjects order by owner_user_id, created_at, id) p
where s.user_id = p.owner_user_id and s.mode = 'dr_paws' and s.subject_id is null;

alter table public.naya_conversation_sessions add constraint naya_sessions_subject_scope
  check ((mode = 'naya' and subject_id is null) or (mode = 'dr_paws' and subject_id is not null));
alter table public.naya_session_summaries add constraint naya_summaries_subject_scope
  check ((mode = 'naya' and subject_id is null) or (mode = 'dr_paws' and subject_id is not null));
alter table public.naya_memories add constraint naya_memories_subject_scope
  check ((mode = 'naya' and subject_id is null) or (mode = 'dr_paws' and subject_id is not null));
alter table public.naya_open_loops add constraint naya_loops_subject_scope
  check ((mode = 'naya' and subject_id is null) or (mode = 'dr_paws' and subject_id is not null));

alter table public.naya_memories drop constraint if exists naya_memories_mode_unique;
alter table public.naya_memories add constraint naya_memories_subject_unique
  unique nulls not distinct (user_id, mode, subject_id, category, normalized_key);
alter table public.naya_open_loops drop constraint if exists naya_open_loops_mode_unique;
alter table public.naya_open_loops add constraint naya_loops_subject_unique
  unique nulls not distinct (user_id, mode, subject_id, normalized_key);
create index if not exists naya_memories_subject_retrieval_idx on public.naya_memories(user_id, mode, subject_id, active, last_seen_at desc);
create index if not exists naya_loops_subject_open_idx on public.naya_open_loops(user_id, mode, subject_id, status, created_at desc);
create index if not exists naya_summaries_subject_recent_idx on public.naya_session_summaries(user_id, mode, subject_id, created_at desc);

alter table public.naya_subjects enable row level security;
grant select, insert, update, delete on public.naya_subjects to service_role;
