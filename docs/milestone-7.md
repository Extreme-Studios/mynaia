# Milestone 7 — Dr. Paws Assessment & Professional Review

Status: **implementation ready; human structured interview validation required**. No Tavus conversation was created for implementation or automated testing.

## Scope and architecture

Dr. Paws retains its existing free chat. A separate professional dashboard lives at `/dr-paws/dashboard`; it uses the existing MyNaiA access password and server-issued HttpOnly cookie. There is no second admin secret and no multi-user role system. Naia's PAL, call flow, memory, and UI were not changed by this milestone.

The dashboard selects a child profile, one of seven original conversational templates or a custom immutable template, and a 3/5/10/20-minute duration (default five). Before a child's first structured session, an adult records product-level consent version, timestamp, and actor. The backend checks consent and template ownership **before** creating a Tavus conversation. The optional professional note is saved on the assessment session; it only enters the realtime context when the professional explicitly checks the context option. The child-facing screen continues to show the regular Dr. Paws call experience. A compact template goal context augments the existing subject-scoped Supabase context. No full transcript or questionnaire script is injected.

The seven seeded templates are Perkenalan & Minat, Emosi Hari Ini, Sekolah & Belajar, Teman & Interaksi, Keluarga & Rutinitas, Follow-up Sesi Sebelumnya, and Observasi Umum. They contain original domain goals, not proprietary tests, scores, or diagnostic thresholds. Custom templates contain name, purpose, and domain goals with optional example questions. Templates are immutable after creation in this milestone; each session saves both template ID/version and a snapshot so future template edits cannot rewrite the historical interview definition.

## Post-session pipeline

1. Tavus handles realtime voice/video and ends on the existing route.
2. The existing memory service retrieves the Tavus transcript and stores per-turn text in Supabase. Secrets are redacted by the existing transcript parser; this is the retained historical text record, not an audio/video recording.
3. Gemini receives a separate constrained assessment prompt and numbered transcript. The validator only accepts observations with evidence pointing to actual **child** turn numbers, drops unsupported or diagnostic claims, and treats safety indicators only as adult review flags.
4. A report draft is built from validated structured analysis. Professional notes remain separate from AI text. Drafts never auto-finalize.
5. Authorized reviewer can edit summary, purpose, follow-ups, and evidence-backed observation wording, remove inaccurate observations, add notes, mark REVIEWED, and then FINAL. Every change saves the prior version. Editing FINAL reopens a new DRAFT revision rather than silently replacing the final document.
6. PDF is generated on demand only for REVIEWED/FINAL, through the authenticated API with `no-store`; reports are not placed in a public bucket or static folder.

If memory extraction fails after the transcript is stored, assessment processing still reads the saved transcript. If transcript or Gemini analysis is pending/failed, the dashboard offers manual retry on the **existing** session. Retry never creates a Tavus conversation. Unique constraints on conversation session, analysis, report, consent, and revision prevent duplicate records. There is no automatic retry loop.

## Data and access

Migration `supabase/migrations/005_dr_paws_assessment.sql` adds `naya_assessment_templates`, `naya_assessment_consents`, `naya_assessment_sessions`, `naya_assessment_analyses`, `naya_assessment_reports`, and `naya_assessment_report_revisions`. It is additive, enables RLS, revokes anon/authenticated grants, and grants service-role access. Existing Naia and Dr. Paws tables and rows are preserved. The same Supabase project `mynaia` was verified before applying it; SQL Editor reported success, then a read query found seven seeded templates and zero assessment sessions. Dashboard queries scope by the single prototype owner and child UUID. Child profile shows session history, recent summaries, open topics, consent state, and free chat count. The memory reset action still only clears memory/summary/open loops, never assessment records.

Migration `006_dr_paws_assessment_deletion.sql` adds two service-role-only transactional deletion functions. Both definitions were applied to production; a read query verified `service_role` can execute each and `anon` cannot. Neither function was invoked. Deleting one structured session requires typing `HAPUS SESI`; it removes that session's report/revisions, analysis, transcript, and conversation record, while retaining safe extracted memory without a source pointer. Deleting a child profile requires typing `HAPUS PROFIL DAN DATA`; it removes that child's Supabase conversations (including free chat), transcripts, memory, consent, assessments, analyses, reports, and profile. Neither function touches Naia or other child UUIDs. If any FK/DB step fails, PostgreSQL rolls back the whole function call. Tavus account-side data is **not** deleted by either function and must be handled separately if needed.

Migration `007_dr_paws_analysis_model.sql` adds the model name used for post-session analysis. It was applied to production and the column was confirmed through the server-side Supabase API. Analysis rows also retain prompt version; sessions retain template version, and reports retain review/final timestamps.

The current shared access password means anyone who knows that password is an authorized prototype reviewer. It does not distinguish parent, child, and professional roles. Do not share the password with a child if report access must remain restricted. A later multi-user rollout needs separate accounts/roles and a retention policy. The service worker bypasses `/api/`, dashboard assets, and dashboard navigation; private records are network-only.

## Local validation and limits

`npm run check`, `npm test` (70/70), `npm run build`, and `git diff --check` passed. `tests/milestone-7.test.mjs` uses mocks for consent isolation, evidence validation, report lifecycle/revisions, idempotent retry, typed deletion confirmation, PDF output, API password/Origin gate, and no Tavus create. A mock reviewed report PDF was rendered to PNG and visually inspected. Dashboard screenshots in `docs/visual-qa/milestone-7/` show desktop, mobile, and report detail with fake data. Mock browser checks at 390, 430, 768, 1024, and 1366 px found no horizontal overflow; the report evidence link is present and the local browser console recorded no warnings/errors. No live interview, voice quality, clinical validity, safety behavior in a real call, or human report interpretation has been verified. The first real structured interview must be performed by the user with consent and available Tavus minutes; suggested scenario in the request is Bimo, Sekolah & Belajar, five minutes. Review transcript accuracy, evidence, flags, report wording, and PDF manually. Do not label this milestone PASSED until that validation is completed.

## Operational notes

- Admin route: `/dr-paws/dashboard` after entering the existing app password.
- API: `/api/dr-paws/assessment?action=dashboard|templates|child|consent|session|retry|report|template|pdf` (methods vary; all require the access cookie; writes require same-origin).
- A structured session is linked to a Dr. Paws conversation session and subject UUID. Free chat omits `assessmentTemplateId` and follows the old behavior.
- Generated reports carry the disclaimer: “Hasil ini merupakan ringkasan berbasis percakapan dengan AI dan bukan diagnosis psikologis atau medis.”
- Neither Tavus key nor Gemini/Supabase service key is returned to the browser. No report URL is anonymous.
