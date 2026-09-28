-- Add reproducibility metadata without changing any existing analysis content.
alter table public.naya_assessment_analyses
  add column if not exists analysis_model text not null default 'gemini-2.5-flash';
