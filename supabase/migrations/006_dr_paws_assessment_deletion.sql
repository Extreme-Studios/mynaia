-- Transactional, deliberately confirmed deletion. No function runs automatically.
-- Service role only; deletes local Supabase data, not Tavus account-side records.
create or replace function public.naya_delete_assessment_session(
  p_session_id uuid, p_owner_user_id text, p_confirmation text
) returns boolean language plpgsql security invoker set search_path = public as $$
declare v_conversation_id uuid;
begin
  if p_confirmation is distinct from 'HAPUS SESI' then raise exception 'CONFIRMATION_REQUIRED'; end if;
  select conversation_session_id into v_conversation_id
    from public.naya_assessment_sessions
    where id = p_session_id and owner_user_id = p_owner_user_id;
  if v_conversation_id is null then raise exception 'SESSION_NOT_FOUND'; end if;
  delete from public.naya_assessment_report_revisions where session_id = p_session_id and owner_user_id = p_owner_user_id;
  delete from public.naya_assessment_reports where session_id = p_session_id and owner_user_id = p_owner_user_id;
  delete from public.naya_assessment_analyses where session_id = p_session_id and owner_user_id = p_owner_user_id;
  delete from public.naya_assessment_sessions where id = p_session_id and owner_user_id = p_owner_user_id;
  -- Preserve the child's separately extracted safe memory, but remove its source pointer.
  update public.naya_memories set source_session_id = null where user_id = p_owner_user_id and source_session_id = v_conversation_id;
  update public.naya_open_loops set source_session_id = null where user_id = p_owner_user_id and source_session_id = v_conversation_id;
  delete from public.naya_conversation_sessions
    where id = v_conversation_id and user_id = p_owner_user_id and mode = 'dr_paws';
  return true;
end $$;

create or replace function public.naya_delete_child_profile(
  p_subject_id uuid, p_owner_user_id text, p_confirmation text
) returns boolean language plpgsql security invoker set search_path = public as $$
begin
  if p_confirmation is distinct from 'HAPUS PROFIL DAN DATA' then raise exception 'CONFIRMATION_REQUIRED'; end if;
  if not exists (select 1 from public.naya_subjects where id = p_subject_id and owner_user_id = p_owner_user_id)
    then raise exception 'SUBJECT_NOT_FOUND'; end if;
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

revoke all on function public.naya_delete_assessment_session(uuid,text,text) from public, anon, authenticated;
revoke all on function public.naya_delete_child_profile(uuid,text,text) from public, anon, authenticated;
grant execute on function public.naya_delete_assessment_session(uuid,text,text) to service_role;
grant execute on function public.naya_delete_child_profile(uuid,text,text) to service_role;
