-- Milestone 8: additive, private longitudinal case data. Apply after 007.
create table if not exists public.naya_reviewers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null references public.naya_users(id),
  display_name text not null check (char_length(display_name) between 2 and 100),
  professional_role text not null check (char_length(professional_role) between 2 and 100),
  organization text,
  credential_note text,
  created_at timestamptz not null default now()
);
create index if not exists naya_reviewers_owner_idx on public.naya_reviewers(owner_user_id, created_at);

create table if not exists public.naya_case_sources (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null references public.naya_users(id),
  subject_id uuid not null references public.naya_subjects(id),
  reviewer_id uuid references public.naya_reviewers(id),
  source_type text not null check (source_type in ('PARENT','TEACHER','PROFESSIONAL','OTHER_CAREGIVER')),
  source_name text not null check (char_length(source_name) between 2 and 100),
  relationship text,
  observed_at timestamptz not null,
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  notes text not null default '',
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists naya_case_sources_subject_idx on public.naya_case_sources(owner_user_id, subject_id, observed_at desc);

create table if not exists public.naya_case_audit (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null references public.naya_users(id),
  subject_id uuid not null references public.naya_subjects(id),
  reviewer_id uuid references public.naya_reviewers(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  previous_state jsonb,
  new_state jsonb,
  created_at timestamptz not null default now()
);
create index if not exists naya_case_audit_subject_idx on public.naya_case_audit(owner_user_id, subject_id, created_at desc);

create table if not exists public.naya_longitudinal_analyses (
  subject_id uuid primary key references public.naya_subjects(id),
  owner_user_id text not null references public.naya_users(id),
  version integer not null default 1 check (version > 0),
  result jsonb not null,
  source_fingerprint text not null,
  source_updated_at timestamptz,
  generated_at timestamptz not null default now(),
  prompt_version text not null,
  model text not null
);

create table if not exists public.naya_follow_up_plans (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null references public.naya_users(id),
  subject_id uuid not null references public.naya_subjects(id),
  reviewer_id uuid not null references public.naya_reviewers(id),
  goals jsonb not null check (jsonb_typeof(goals) = 'array'),
  status text not null default 'draft' check (status in ('draft','used')),
  analysis_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists naya_follow_up_plans_subject_idx on public.naya_follow_up_plans(owner_user_id, subject_id, created_at desc);

create table if not exists public.naya_longitudinal_reports (
  subject_id uuid primary key references public.naya_subjects(id),
  owner_user_id text not null references public.naya_users(id),
  status text not null default 'draft' check (status in ('draft','reviewed','final')),
  version integer not null default 1 check (version > 0),
  content jsonb not null,
  professional_notes text not null default '',
  reviewer_id uuid references public.naya_reviewers(id),
  reviewed_at timestamptz,
  finalized_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.naya_longitudinal_report_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null references public.naya_users(id),
  subject_id uuid not null references public.naya_longitudinal_reports(subject_id),
  version integer not null,
  previous_status text not null,
  previous_content jsonb not null,
  previous_professional_notes text not null,
  reviewer_id uuid references public.naya_reviewers(id),
  changed_at timestamptz not null default now(),
  unique(subject_id, version)
);

alter table public.naya_reviewers enable row level security;
alter table public.naya_case_sources enable row level security;
alter table public.naya_case_audit enable row level security;
alter table public.naya_longitudinal_analyses enable row level security;
alter table public.naya_follow_up_plans enable row level security;
alter table public.naya_longitudinal_reports enable row level security;
alter table public.naya_longitudinal_report_revisions enable row level security;
revoke all on public.naya_reviewers, public.naya_case_sources, public.naya_case_audit,
  public.naya_longitudinal_analyses, public.naya_follow_up_plans,
  public.naya_longitudinal_reports, public.naya_longitudinal_report_revisions from anon, authenticated;
grant select, insert, update, delete on public.naya_reviewers, public.naya_case_sources,
  public.naya_case_audit, public.naya_longitudinal_analyses, public.naya_follow_up_plans,
  public.naya_longitudinal_reports, public.naya_longitudinal_report_revisions to service_role;

-- Keep the existing explicit child deletion transactional and free of private orphans.
create or replace function public.naya_delete_child_profile(
  p_subject_id uuid, p_owner_user_id text, p_confirmation text
) returns boolean language plpgsql security invoker set search_path = public as $$
begin
  if p_confirmation is distinct from 'HAPUS PROFIL DAN DATA' then raise exception 'CONFIRMATION_REQUIRED'; end if;
  if not exists (select 1 from public.naya_subjects where id = p_subject_id and owner_user_id = p_owner_user_id)
    then raise exception 'SUBJECT_NOT_FOUND'; end if;
  delete from public.naya_longitudinal_report_revisions where owner_user_id = p_owner_user_id and subject_id = p_subject_id;
  delete from public.naya_longitudinal_reports where owner_user_id = p_owner_user_id and subject_id = p_subject_id;
  delete from public.naya_follow_up_plans where owner_user_id = p_owner_user_id and subject_id = p_subject_id;
  delete from public.naya_longitudinal_analyses where owner_user_id = p_owner_user_id and subject_id = p_subject_id;
  delete from public.naya_case_audit where owner_user_id = p_owner_user_id and subject_id = p_subject_id;
  delete from public.naya_case_sources where owner_user_id = p_owner_user_id and subject_id = p_subject_id;
  delete from public.naya_assessment_report_revisions where owner_user_id = p_owner_user_id
    and session_id in (select id from public.naya_assessment_sessions where owner_user_id = p_owner_user_id and subject_id = p_subject_id);
  delete from public.naya_assessment_reports where owner_user_id = p_owner_user_id
    and session_id in (select id from public.naya_assessment_sessions where owner_user_id = p_owner_user_id and subject_id = p_subject_id);
  delete from public.naya_assessment_analyses where owner_user_id = p_owner_user_id
    and session_id in (select id from public.naya_assessment_sessions where owner_user_id = p_owner_user_id and subject_id = p_subject_id);
  delete from public.naya_assessment_sessions where owner_user_id = p_owner_user_id and subject_id = p_subject_id;
  delete from public.naya_assessment_consents where owner_user_id = p_owner_user_id and subject_id = p_subject_id;
  delete from public.naya_memories where user_id = p_owner_user_id and mode = 'dr_paws' and subject_id = p_subject_id;
  delete from public.naya_open_loops where user_id = p_owner_user_id and mode = 'dr_paws' and subject_id = p_subject_id;
  delete from public.naya_session_summaries where user_id = p_owner_user_id and mode = 'dr_paws' and subject_id = p_subject_id;
  delete from public.naya_conversation_sessions where user_id = p_owner_user_id and mode = 'dr_paws' and subject_id = p_subject_id;
  delete from public.naya_subjects where id = p_subject_id and owner_user_id = p_owner_user_id;
  return true;
end $$;
revoke all on function public.naya_delete_child_profile(uuid,text,text) from public, anon, authenticated;
grant execute on function public.naya_delete_child_profile(uuid,text,text) to service_role;

-- Explicit deletion of collateral information and every stored derivative is one transaction.
create or replace function public.naya_delete_case_source(
  p_subject_id uuid, p_source_id uuid, p_owner_user_id text, p_reviewer_id uuid, p_confirmation text
) returns boolean language plpgsql security invoker set search_path = public as $$
declare v_type text;
begin
  if p_confirmation is distinct from 'HAPUS SUMBER' then raise exception 'CONFIRMATION_REQUIRED'; end if;
  if not exists (select 1 from public.naya_reviewers where id = p_reviewer_id and owner_user_id = p_owner_user_id)
    then raise exception 'REVIEWER_NOT_FOUND'; end if;
  select source_type into v_type from public.naya_case_sources where id = p_source_id
    and subject_id = p_subject_id and owner_user_id = p_owner_user_id for update;
  if v_type is null then raise exception 'SOURCE_NOT_FOUND'; end if;
  delete from public.naya_longitudinal_report_revisions where subject_id = p_subject_id and owner_user_id = p_owner_user_id;
  delete from public.naya_longitudinal_reports where subject_id = p_subject_id and owner_user_id = p_owner_user_id;
  delete from public.naya_longitudinal_analyses where subject_id = p_subject_id and owner_user_id = p_owner_user_id;
  delete from public.naya_follow_up_plans where subject_id = p_subject_id and owner_user_id = p_owner_user_id;
  delete from public.naya_case_audit where subject_id = p_subject_id and owner_user_id = p_owner_user_id
    and ((entity_type = 'source' and entity_id = p_source_id)
      or entity_type in ('analysis','hypothesis','longitudinal_report','plan'));
  delete from public.naya_case_sources where id = p_source_id and subject_id = p_subject_id and owner_user_id = p_owner_user_id;
  insert into public.naya_case_audit(owner_user_id, subject_id, reviewer_id, action, entity_type, entity_id, previous_state)
    values (p_owner_user_id, p_subject_id, p_reviewer_id, 'SOURCE_DELETED', 'case', p_subject_id, jsonb_build_object('source_type', v_type));
  return true;
end $$;
revoke all on function public.naya_delete_case_source(uuid,uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.naya_delete_case_source(uuid,uuid,text,uuid,text) to service_role;

-- Deleting a session also clears analyses/reports that may quote that session.
create or replace function public.naya_delete_assessment_session(
  p_session_id uuid, p_owner_user_id text, p_confirmation text
) returns boolean language plpgsql security invoker set search_path = public as $$
declare v_conversation_id uuid; v_subject_id uuid;
begin
  if p_confirmation is distinct from 'HAPUS SESI' then raise exception 'CONFIRMATION_REQUIRED'; end if;
  select conversation_session_id, subject_id into v_conversation_id, v_subject_id
    from public.naya_assessment_sessions where id = p_session_id and owner_user_id = p_owner_user_id for update;
  if v_conversation_id is null then raise exception 'SESSION_NOT_FOUND'; end if;
  delete from public.naya_longitudinal_report_revisions where subject_id = v_subject_id and owner_user_id = p_owner_user_id;
  delete from public.naya_longitudinal_reports where subject_id = v_subject_id and owner_user_id = p_owner_user_id;
  delete from public.naya_longitudinal_analyses where subject_id = v_subject_id and owner_user_id = p_owner_user_id;
  delete from public.naya_follow_up_plans where subject_id = v_subject_id and owner_user_id = p_owner_user_id;
  delete from public.naya_case_audit where owner_user_id = p_owner_user_id and subject_id = v_subject_id
    and entity_type in ('analysis','hypothesis','longitudinal_report','plan');
  delete from public.naya_case_audit where owner_user_id = p_owner_user_id and subject_id = v_subject_id
    and entity_type = 'session_report' and entity_id = p_session_id;
  delete from public.naya_assessment_report_revisions where session_id = p_session_id and owner_user_id = p_owner_user_id;
  delete from public.naya_assessment_reports where session_id = p_session_id and owner_user_id = p_owner_user_id;
  delete from public.naya_assessment_analyses where session_id = p_session_id and owner_user_id = p_owner_user_id;
  delete from public.naya_assessment_sessions where id = p_session_id and owner_user_id = p_owner_user_id;
  update public.naya_memories set source_session_id = null where user_id = p_owner_user_id and source_session_id = v_conversation_id;
  update public.naya_open_loops set source_session_id = null where user_id = p_owner_user_id and source_session_id = v_conversation_id;
  delete from public.naya_conversation_sessions where id = v_conversation_id and user_id = p_owner_user_id and mode = 'dr_paws';
  return true;
end $$;
revoke all on function public.naya_delete_assessment_session(uuid,text,text) from public, anon, authenticated;
grant execute on function public.naya_delete_assessment_session(uuid,text,text) to service_role;
