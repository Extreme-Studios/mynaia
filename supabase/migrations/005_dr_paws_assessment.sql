-- Milestone 7: additive Dr. Paws assessment records. No existing data is deleted.
-- Apply after 001-004. Service role access only; no anon/authenticated policies.
create table if not exists public.naya_assessment_templates (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text references public.naya_users(id),
  slug text not null unique,
  name text not null check (char_length(name) between 1 and 100),
  purpose text not null check (char_length(purpose) between 1 and 600),
  version integer not null default 1 check (version > 0),
  active boolean not null default true,
  built_in boolean not null default false,
  domains jsonb not null check (jsonb_typeof(domains) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists naya_assessment_templates_owner_idx on public.naya_assessment_templates(owner_user_id, active);

create table if not exists public.naya_assessment_consents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null references public.naya_users(id),
  subject_id uuid not null references public.naya_subjects(id),
  consent_version text not null,
  consent_actor text not null check (char_length(consent_actor) between 2 and 100),
  consent_timestamp timestamptz not null default now(),
  unique(owner_user_id, subject_id, consent_version)
);
create index if not exists naya_assessment_consents_subject_idx on public.naya_assessment_consents(owner_user_id, subject_id);

create table if not exists public.naya_assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null references public.naya_users(id),
  subject_id uuid not null references public.naya_subjects(id),
  conversation_session_id uuid not null unique references public.naya_conversation_sessions(id),
  template_id uuid not null references public.naya_assessment_templates(id),
  template_version integer not null,
  template_snapshot jsonb not null,
  professional_note text,
  planned_duration_minutes integer not null check (planned_duration_minutes in (3,5,10,20)),
  status text not null default 'processing' check (status in ('processing','transcript_pending','analysis_failed','draft','reviewed','final')),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists naya_assessment_sessions_subject_idx on public.naya_assessment_sessions(owner_user_id, subject_id, created_at desc);

create table if not exists public.naya_assessment_analyses (
  session_id uuid primary key references public.naya_assessment_sessions(id),
  owner_user_id text not null references public.naya_users(id),
  result jsonb not null,
  prompt_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.naya_assessment_reports (
  session_id uuid primary key references public.naya_assessment_sessions(id),
  owner_user_id text not null references public.naya_users(id),
  status text not null default 'draft' check (status in ('draft','reviewed','final')),
  version integer not null default 1 check (version > 0),
  content jsonb not null,
  professional_notes text not null default '',
  reviewed_at timestamptz,
  finalized_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.naya_assessment_report_revisions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.naya_assessment_reports(session_id),
  owner_user_id text not null references public.naya_users(id),
  version integer not null,
  previous_status text not null,
  previous_content jsonb not null,
  previous_professional_notes text not null,
  changed_at timestamptz not null default now(),
  unique(session_id, version)
);

alter table public.naya_assessment_templates enable row level security;
alter table public.naya_assessment_consents enable row level security;
alter table public.naya_assessment_sessions enable row level security;
alter table public.naya_assessment_analyses enable row level security;
alter table public.naya_assessment_reports enable row level security;
alter table public.naya_assessment_report_revisions enable row level security;
revoke all on public.naya_assessment_templates, public.naya_assessment_consents,
  public.naya_assessment_sessions, public.naya_assessment_analyses,
  public.naya_assessment_reports, public.naya_assessment_report_revisions from anon, authenticated;
grant select, insert, update, delete on public.naya_assessment_templates,
  public.naya_assessment_consents, public.naya_assessment_sessions,
  public.naya_assessment_analyses, public.naya_assessment_reports,
  public.naya_assessment_report_revisions to service_role;

-- Original conversational goals, not licensed instruments or scoring rubrics.
insert into public.naya_assessment_templates (slug,name,purpose,built_in,domains) values
('perkenalan-minat','Perkenalan & Minat','Membangun rasa nyaman dan mengenal hal yang disukai anak.',true,'[{"domain":"perkenalan","goal":"Kenali nama panggilan dan kegiatan yang disukai tanpa memaksa anak menjawab.","example":"Kalau lagi santai, kamu suka ngapain?"},{"domain":"minat","goal":"Dengarkan minat, permainan, atau cerita yang ingin dibagikan anak."}]'::jsonb),
('emosi-hari-ini','Emosi Hari Ini','Mendengarkan perasaan anak hari ini secara aman.',true,'[{"domain":"suasana_hati","goal":"Undang anak menceritakan perasaan hari ini dengan bahasa sederhana."},{"domain":"hal_menyenangkan","goal":"Dengarkan hal yang membuat anak senang."},{"domain":"menenangkan_diri","goal":"Tanyakan kegiatan yang biasanya membantu anak merasa tenang tanpa menilai."}]'::jsonb),
('sekolah-belajar','Sekolah & Belajar','Memahami pengalaman sehari-hari anak di sekolah.',true,'[{"domain":"sekolah","goal":"Dengarkan bagian sekolah yang anak sukai atau kurang nyaman."},{"domain":"belajar","goal":"Kenali kegiatan belajar yang menarik dan yang terasa menantang."},{"domain":"kelas","goal":"Tanyakan pengalaman di kelas dan interaksi dengan guru secara netral."}]'::jsonb),
('teman-interaksi','Teman & Interaksi','Mendengarkan pengalaman bermain dan berinteraksi.',true,'[{"domain":"teman","goal":"Dengarkan cerita tentang teman dan kegiatan bersama."},{"domain":"interaksi","goal":"Pahami bagaimana anak merasa dilibatkan saat bermain, tanpa melabeli."},{"domain":"konflik","goal":"Jika anak mengangkat konflik, dengarkan responsnya tanpa menyalahkan."}]'::jsonb),
('keluarga-rutinitas','Keluarga & Rutinitas','Mendengarkan rutinitas dan kenyamanan sehari-hari.',true,'[{"domain":"rutinitas","goal":"Tanyakan rutinitas harian yang ingin diceritakan anak."},{"domain":"keluarga","goal":"Dengarkan kegiatan menyenangkan bersama orang di rumah, tanpa mengorek rahasia."},{"domain":"istirahat","goal":"Tanyakan kebiasaan pagi atau istirahat secara ringan."}]'::jsonb),
('follow-up','Follow-up Sesi Sebelumnya','Melanjutkan topik ringan yang sebelumnya belum selesai.',true,'[{"domain":"kelanjutan","goal":"Tanyakan apakah anak ingin melanjutkan cerita sebelumnya; beri pilihan topik baru."},{"domain":"perubahan","goal":"Dengarkan apakah ada hal yang berubah sejak obrolan sebelumnya."}]'::jsonb),
('observasi-umum','Observasi Umum','Percakapan luas tentang kegiatan dan pengalaman sehari-hari.',true,'[{"domain":"keseharian","goal":"Undang anak berbagi pengalaman hari ini."},{"domain":"minat","goal":"Dengarkan kegiatan yang disukai anak."},{"domain":"hubungan","goal":"Jika muncul alami, dengarkan cerita tentang teman atau orang dekat."}]'::jsonb)
on conflict (slug) do nothing;
