-- Run once in the Supabase SQL editor. All application access uses a server-side service key.
create table if not exists public.naya_users (
  id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.naya_conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.naya_users(id),
  tavus_conversation_id text not null unique,
  pal_id text,
  face_id text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  transcript_status text not null default 'pending' check (transcript_status in ('pending','ready','error')),
  summary_status text not null default 'pending' check (summary_status in ('pending','ready','error')),
  memory_status text not null default 'pending' check (memory_status in ('pending','ready','error')),
  last_sync_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists naya_conversation_sessions_pending_idx on public.naya_conversation_sessions(transcript_status, started_at);

create table if not exists public.naya_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.naya_conversation_sessions(id) on delete cascade,
  position integer not null,
  role text not null check (role in ('user','assistant','system','tool')),
  content text not null,
  spoken_at timestamptz,
  seconds_from_start double precision,
  duration double precision,
  unique(session_id, position)
);

create table if not exists public.naya_memories (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.naya_users(id),
  category text not null check (category in ('PROFILE','PREFERENCE','RELATIONSHIP','EPISODIC','PROJECT','ROUTINE','INTERACTION_STYLE','OPEN_LOOP','INSIDE_JOKE')),
  content text not null,
  normalized_key text not null,
  importance real not null default 0.5 check (importance between 0 and 1),
  confidence real not null default 0.5 check (confidence between 0 and 1),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  source_session_id uuid references public.naya_conversation_sessions(id),
  active boolean not null default true,
  expires_at timestamptz,
  superseded_by uuid references public.naya_memories(id),
  unique(user_id, category, normalized_key)
);
create index if not exists naya_memories_retrieval_idx on public.naya_memories(user_id, active, importance desc, last_seen_at desc);

create table if not exists public.naya_user_profile (
  user_id text primary key references public.naya_users(id),
  display_name text,
  preferred_language text,
  interaction_style text,
  updated_at timestamptz not null default now()
);

create table if not exists public.naya_open_loops (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.naya_users(id),
  content text not null,
  normalized_key text not null,
  status text not null default 'open' check (status in ('open','resolved')),
  source_session_id uuid references public.naya_conversation_sessions(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(user_id, normalized_key)
);
create index if not exists naya_open_loops_active_idx on public.naya_open_loops(user_id, status, created_at desc);

create table if not exists public.naya_session_summaries (
  session_id uuid primary key references public.naya_conversation_sessions(id) on delete cascade,
  user_id text not null references public.naya_users(id),
  summary text not null,
  tone text,
  topics text[] not null default '{}',
  follow_ups text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.naya_users enable row level security;
alter table public.naya_conversation_sessions enable row level security;
alter table public.naya_conversation_messages enable row level security;
alter table public.naya_memories enable row level security;
alter table public.naya_user_profile enable row level security;
alter table public.naya_open_loops enable row level security;
alter table public.naya_session_summaries enable row level security;
-- No anon/authenticated policies: only trusted server-side service role can access these tables.
grant usage on schema public to service_role;
grant select, insert, update, delete on
  public.naya_users, public.naya_conversation_sessions, public.naya_conversation_messages,
  public.naya_memories, public.naya_user_profile, public.naya_open_loops, public.naya_session_summaries
  to service_role;

