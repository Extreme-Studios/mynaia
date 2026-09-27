-- Milestone 5. Existing rows become Naya rows without deletion or re-keying.
alter table public.naya_conversation_sessions add column if not exists mode text not null default 'naya' check (mode in ('naya', 'dr_paws'));
alter table public.naya_session_summaries add column if not exists mode text not null default 'naya' check (mode in ('naya', 'dr_paws'));
alter table public.naya_memories add column if not exists mode text not null default 'naya' check (mode in ('naya', 'dr_paws'));
alter table public.naya_open_loops add column if not exists mode text not null default 'naya' check (mode in ('naya', 'dr_paws'));
alter table public.naya_user_profile add column if not exists mode text not null default 'naya' check (mode in ('naya', 'dr_paws'));

alter table public.naya_memories drop constraint if exists naya_memories_user_id_category_normalized_key_key;
alter table public.naya_memories add constraint naya_memories_mode_unique unique (user_id, mode, category, normalized_key);
alter table public.naya_open_loops drop constraint if exists naya_open_loops_user_id_normalized_key_key;
alter table public.naya_open_loops add constraint naya_open_loops_mode_unique unique (user_id, mode, normalized_key);
alter table public.naya_user_profile drop constraint if exists naya_user_profile_pkey;
alter table public.naya_user_profile add constraint naya_user_profile_pkey primary key (user_id, mode);

create index if not exists naya_sessions_user_mode_pending_idx on public.naya_conversation_sessions(user_id, mode, memory_status, started_at);
create index if not exists naya_memories_user_mode_active_idx on public.naya_memories(user_id, mode, active, importance desc, last_seen_at desc);
create index if not exists naya_loops_user_mode_status_idx on public.naya_open_loops(user_id, mode, status, created_at desc);
create index if not exists naya_summaries_user_mode_created_idx on public.naya_session_summaries(user_id, mode, created_at desc);
