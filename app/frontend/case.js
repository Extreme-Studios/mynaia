import { apiFetch, installNativeNavigation } from './platform.mjs';
const $ = (selector) => document.querySelector(selector);
const node = (tag, text = '', className = '') => { const element = document.createElement(tag); element.textContent = text;
  if (className) element.className = className; return element; };
const date = (value) => value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const subjectId = new URLSearchParams(location.search).get('subject') || location.pathname.split('/').at(-1);
const fields = {
  PARENT: [['strengths','Kekuatan'],['interests','Minat'],['daily_routine','Rutinitas'],['school_experience','Pengalaman sekolah'],
    ['social_interaction','Interaksi sosial'],['emotional_regulation','Pengaturan emosi'],['communication','Komunikasi'],
    ['behaviors_of_concern','Perilaku yang diperhatikan'],['recent_changes','Perubahan terbaru'],['questions','Pertanyaan orang tua']],
  TEACHER: [['classroom_participation','Partisipasi kelas'],['attention_during_activities','Perhatian saat kegiatan'],
    ['communication','Komunikasi'],['peer_interaction','Interaksi teman'],['response_to_instruction','Respons instruksi'],
    ['transitions','Perubahan kegiatan'],['emotional_regulation','Pengaturan emosi'],['strengths','Kekuatan'],
    ['challenges','Tantangan'],['contextual_notes','Konteks kelas']],
  PROFESSIONAL: [['observation_title','Judul observasi'],['domain','Area'],['observation','Observasi langsung'],
    ['source_context','Konteks sumber'],['strengths','Kekuatan'],['questions','Pertanyaan lanjutan']],
  OTHER_CAREGIVER: [['strengths','Kekuatan'],['daily_routine','Rutinitas'],['social_interaction','Interaksi sosial'],
    ['communication','Komunikasi'],['recent_changes','Perubahan'],['questions','Pertanyaan']],
};
const sourceLabel = { CHILD: 'Laporan anak', PARENT: 'Laporan orang tua', TEACHER: 'Observasi guru',
  PROFESSIONAL: 'Observasi profesional', OTHER_CAREGIVER: 'Pengasuh lain' };
let data, reviewers = [], editingSource = null;
async function api(action, { method = 'GET', body, ref, id = subjectId } = {}) {
  const query = new URLSearchParams({ action, ...(id ? { id } : {}), ...(ref ? { ref } : {}) });
  const response = await apiFetch(`/api/dr-paws/case?${query}`, { method, cache: 'no-store',
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  if (action === 'pdf' && response.ok) return response.blob();
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}
function notice(message, failure = false) {
  $('#notice').hidden = false; $('#notice').textContent = message; $('#retry').hidden = !failure;
}
function reviewerId() {
  const id = $('#reviewer').value;
  if (!id) throw new Error('Pilih atau buat profil reviewer dahulu.');
  return id;
}
function textList(target, values, empty = 'Belum ada data.') {
  target.replaceChildren();
  if (!values?.length) { target.append(node('p', empty, 'muted')); return; }
  for (const value of values) target.append(node('p', value));
}
function sourceFields(type, answers = {}) {
  const target = $('#source-fields'); target.replaceChildren();
  for (const [key, label] of fields[type] || []) {
    const wrapper = node('label', label); const input = node('textarea'); input.rows = 2; input.maxLength = 1000;
    input.dataset.field = key; input.value = answers[key] || ''; wrapper.append(input); target.append(wrapper);
  }
}
function evidenceButton(ref) {
  const button = node('button', 'Lihat bukti', 'evidence-button'); button.type = 'button';
  button.addEventListener('click', async () => {
    try {
      const item = await api('evidence', { ref });
      const box = $('#evidence-detail'); box.replaceChildren(node('strong', `${sourceLabel[item.source_type] || item.source_type} · ${date(item.date)}`));
      box.append(node('p', item.session_name || item.source_name || item.field || 'Bukti asal'));
      if (item.turn != null) box.append(node('small', `Giliran anak #${item.turn}`));
      box.append(node('blockquote', item.excerpt)); box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) { notice(error.message, true); }
  });
  return button;
}
function references(target, refs = []) { for (const ref of refs) target.append(evidenceButton(ref)); }
function renderReviewers() {
  const select = $('#reviewer'), selected = localStorage.getItem('mynaia.reviewerId') || '';
  select.replaceChildren(new Option('Pilih reviewer', ''));
  for (const item of reviewers) select.add(new Option(`${item.display_name} · ${item.professional_role}`, item.id));
  if (reviewers.some((item) => item.id === selected)) select.value = selected;
}
function renderSummary() {
  const box = $('#summary'); box.replaceChildren(node('h2', 'Ringkasan kasus'));
  box.append(node('p', `${data.sessionCount} sesi terstruktur · sesi terakhir ${date(data.latestSession?.created_at)}`));
  if (data.historyTruncated) box.append(node('p','Tampilan dibatasi ke 100 sesi terbaru / 120 sumber terbaru. Analisis tidak mencakup seluruh riwayat.','stale'));
  if (data.analysisStale) box.append(node('p', 'Analisis sudah tidak mutakhir. Pilih Update analysis.', 'stale'));
  const summary = data.caseSummary;
  if (!summary) { box.append(node('p', 'Belum ada analisis longitudinal. Tambahkan sumber atau gunakan sesi yang sudah ada, lalu pilih Update analysis.', 'muted')); return; }
  for (const [label, values, format] of [
    ['Kekuatan',summary.strengths,(x) => x.text], ['Pola',summary.patterns,(x) => `${x.title}: ${x.status}`],
    ['Hipotesis kerja',summary.hypotheses,(x) => `${x.review?.wording || x.label} · ${x.status}`],
    ['Perubahan',summary.changes,(x) => x.description], ['Pertanyaan terbuka',summary.missing,(x) => x],
    ['Fokus berikutnya',summary.nextAction,(x) => x]]) {
    box.append(node('h3', label)); const list = node('div'); textList(list, (values || []).slice(0, 4).map(format)); box.append(list);
  }
}
function renderSources() {
  const coverage = $('#source-coverage'); coverage.replaceChildren();
  for (const key of ['CHILD','PARENT','TEACHER','PROFESSIONAL']) coverage.append(node('span',
    `${sourceLabel[key]}: ${data.sourceCoverage[key] ? 'tersedia' : 'belum ada'}`, `source-pill ${data.sourceCoverage[key] ? 'available' : 'missing'}`));
  const list = $('#source-list'); list.replaceChildren(node('h3', 'Catatan sumber'));
  if (!data.sources.length) list.append(node('p', 'Belum ada informasi orang tua, guru, atau observasi profesional.', 'muted'));
  for (const item of data.sources) {
    const card = node('article', '', 'case-card');
    card.append(node('strong', `${sourceLabel[item.source_type]} · ${item.source_name}`), node('small', date(item.observed_at)));
    for (const [key, value] of Object.entries(item.answers || {})) card.append(node('p', `${key.replaceAll('_',' ')}: ${value}`));
    if (item.notes) card.append(node('p', `Catatan: ${item.notes}`));
    const edit = node('button', 'Edit', 'secondary'); edit.type = 'button'; edit.addEventListener('click', () => {
      editingSource = item; $('#source-type').value = item.source_type; $('#source-type').disabled = true;
      $('#source-name').value = item.source_name; $('#source-name').disabled = true;
      $('#source-relationship').value = item.relationship || ''; $('#source-relationship').disabled = true;
      $('#source-date').value = item.observed_at.slice(0, 10); $('#source-date').disabled = true;
      $('#source-notes').value = item.notes || ''; sourceFields(item.source_type, item.answers);
      $('#source-form button').textContent = 'Simpan perubahan'; $('#source-form').scrollIntoView({ behavior: 'smooth' });
    });
    const remove = node('button', 'Hapus sumber', 'secondary'); remove.type = 'button'; remove.addEventListener('click', async () => {
      const confirmation = window.prompt(`Hapus sumber ${item.source_name}? Ketik HAPUS SUMBER. Analisis dan laporan longitudinal turunannya juga akan dihapus.`);
      if (confirmation !== 'HAPUS SUMBER') return;
      try { await api('source-delete', { method: 'POST', ref: item.id,
        body: { reviewerId: reviewerId(), confirmation } }); notice('Sumber dan hasil turunan dihapus.'); await load(); }
      catch (error) { notice(error.message); }
    });
    card.append(edit, remove); list.append(card);
  }
}
function renderTimeline() {
  const box = $('#timeline'); box.replaceChildren();
  for (const item of data.timeline) {
    const card = node('article', '', 'timeline-item');
    card.append(node('small', `${date(item.date)} · ${item.source} · ${item.status}`), node('strong', item.title),
      node('p', item.summary));
    if (item.kind === 'session') { const link = node('a', 'Buka laporan sesi', 'secondary');
      link.href = `/dr-paws/dashboard?session=${encodeURIComponent(item.id)}`; card.append(link); }
    box.append(card);
  }
  if (!data.timeline.length) box.append(node('p', 'Belum ada riwayat.', 'muted'));
  const safety = $('#safety-history'); safety.replaceChildren();
  if (!data.safetyHistory?.length) safety.append(node('p','Tidak ada flag keselamatan tercatat. Ini bukan bukti tidak adanya risiko.','muted'));
  for (const item of data.safetyHistory || []) {
    const card = node('article','', 'case-card');
    card.append(node('strong', `${date(item.date)} · ${item.status}`), node('p', item.reason));
    if (item.reviewed_at) card.append(node('p', `Ditinjau ${date(item.reviewed_at)} oleh ${data.reviewers.find((r)=>r.id===item.reviewed_by)?.display_name || 'reviewer'}: ${item.professional_note || ''}`));
    const form = node('form','', 'inline-review'); const choice = node('select');
    choice.add(new Option('Sudah ditinjau','REVIEWED')); choice.add(new Option('Tindak lanjut diperlukan','FOLLOW_UP_REQUIRED'));
    const label = node('label','Keputusan keselamatan'); label.append(choice);
    const noteLabel = node('label','Catatan profesional'); const note = node('textarea'); note.rows = 2; note.required = true; noteLabel.append(note);
    form.append(label,noteLabel,node('button','Simpan review'));
    form.addEventListener('submit',async (event)=>{event.preventDefault();try {await api('safety-review',{method:'POST',body:{reviewerId:reviewerId(),sessionId:item.session_id,status:choice.value,note:note.value}}); notice('Review keselamatan tersimpan.'); await load();}catch(error){notice(error.message);}});
    card.append(form); safety.append(card);
  }
}
function renderMatrix() {
  const box = $('#coverage-matrix'); box.replaceChildren();
  const sessions = data.timeline.filter((item) => item.kind === 'session').reverse();
  const matrix = data.domainMatrix || {}, domains = Object.keys(matrix);
  if (!domains.length) { box.append(node('p', 'Belum ada area yang dianalisis.', 'muted')); return; }
  const table = node('table'); const head = node('tr'); head.append(node('th', 'Area'));
  sessions.forEach((_, index) => head.append(node('th', `S${index + 1}`))); table.append(head);
  for (const domain of domains) { const row = node('tr'); row.append(node('th', domain));
    for (const session of sessions) row.append(node('td', ({ explored: '✓', partial: '~', not_explored: '—' })[matrix[domain][session.id]] || '—'));
    table.append(row); } box.append(table);
}
function renderAnalysis() {
  const result = data.analysis?.result, box = $('#analysis'); box.replaceChildren();
  $('#analysis-status').textContent = result ? `Versi ${data.analysis.version} · dibuat ${date(data.analysis.generated_at)} · ${data.analysisStale ? 'SUMBER BERUBAH — perlu update' : 'mutakhir sesuai sumber tercatat'}` : 'Belum ada analisis. Gemini hanya dipanggil saat tombol Update analysis ditekan.';
  if (!result) return;
  box.append(node('p', 'AI_PRELIMINARY — BELUM DIVERIFIKASI PROFESIONAL', 'verification preliminary'));
  box.append(node('p', result.summary));
  for (const [title, items, formatter] of [
    ['Pola',result.patterns,(item) => `${item.title} · ${item.status} · ${item.evidence_strength}. ${item.description}`],
    ['Perubahan',result.changes,(item) => item.description],
    ['Kekuatan',result.strengths,(item) => item.text],
    ['Bukti berbeda / bertentangan',result.contradictions,(item) => item.description]]) {
    box.append(node('h3', title));
    if (!items?.length) { box.append(node('p', 'Belum cukup data.', 'muted')); continue; }
    for (const item of items) { const card = node('article', '', 'case-card'); card.append(node('p', formatter(item)));
      references(card, [...(item.supporting_refs || []), ...(item.counter_refs || []), ...(item.earlier_refs || []),
        ...(item.later_refs || []), ...(item.evidence_refs || [])]); box.append(card); }
  }
  box.append(node('h3', 'Informasi yang masih dibutuhkan'));
  const missing = node('div'); textList(missing, result.missing_information || [], 'Belum dicatat.'); box.append(missing);
}
function renderHypotheses() {
  const box = $('#hypotheses'); box.replaceChildren();
  const items = data.report?.content?.current_working_hypotheses || data.analysis?.result?.current_working_hypotheses || [];
  if (!items.length) box.append(node('p', 'Belum cukup data untuk hipotesis spesifik.', 'muted'));
  for (const [index, item] of items.entries()) {
    const card = node('article', '', 'case-card');
    card.append(node('h3', `${item.review?.wording || item.label} · ${item.status}`), node('p', item.rationale),
      node('p', `Karakter bukti: ${item.evidence_strength}; data kurang: ${(item.missing_information || []).join('; ') || 'belum dicatat'}`),
      node('p', `Alternatif: ${(item.alternative_explanations || []).join('; ') || 'belum dicatat'}`));
    card.append(node('strong', 'Bukti pendukung')); references(card, item.supporting_refs);
    if (item.counter_refs?.length) { card.append(node('strong', 'Bukti yang tidak sejalan')); references(card, item.counter_refs); }
    if (item.review) card.append(node('p', `Review: ${item.review.action} oleh ${item.review.reviewer_name} (${date(item.review.reviewed_at)}). ${item.review.note || ''}`));
    const form = node('form', '', 'inline-review'); const selectLabel = node('label', 'Keputusan reviewer');
    const select = node('select');
    for (const [value,label] of [['ACCEPT_FOR_ASSESSMENT','Terima untuk asesmen lanjut'],['REVISE','Revisi'],
      ['REJECT','Tolak'],['NEEDS_MORE_DATA','Bukti belum cukup'],['CONFIRM','Konfirmasi profesional']]) select.add(new Option(label,value));
    selectLabel.append(select); const wordingLabel = node('label','Redaksi revisi (wajib jika Revisi)');
    const wording = node('textarea'); wording.rows = 2; wordingLabel.append(wording);
    const noteLabel = node('label','Catatan reviewer'); const note = node('textarea'); note.rows = 2; noteLabel.append(note);
    const save = node('button','Simpan keputusan'); form.append(selectLabel,wordingLabel,noteLabel,save);
    form.addEventListener('submit', async (event) => { event.preventDefault(); try {
      await api('hypothesis-review', { method: 'POST', body: { reviewerId: reviewerId(), version: data.report.version,
        index, action: select.value, wording: wording.value, note: note.value } });
      notice('Keputusan dan identitas reviewer tercatat.'); await load();
    } catch (error) { notice(error.message); } }); card.append(form); box.append(card);
  }
  const history = $('#hypothesis-history'); history.replaceChildren(node('h3','Riwayat keputusan'));
  for (const item of data.hypothesisHistory || []) history.append(node('p', `${date(item.created_at)} · ${item.action} · ${(data.reviewers.find((r) => r.id === item.reviewer_id)?.display_name) || 'Reviewer'}`));
}
function renderPlans() {
  const box = $('#plans'); box.replaceChildren(node('h3','Rencana tersimpan'));
  for (const plan of data.plans || []) {
    const card = node('article','', 'case-card'); card.append(node('strong', `${date(plan.created_at)} · ${plan.status}`));
    for (const goal of plan.goals) card.append(node('p', `• ${goal}`));
    const launch = node('button','Buat Sesi Follow-up'); launch.type = 'button'; launch.addEventListener('click', async () => {
      try { reviewerId(); const response = await apiFetch('/api/dr-paws/assessment?action=templates', { cache:'no-store' });
        if (!response.ok) throw new Error('Template follow-up belum tersedia.');
        const templates = (await response.json()).templates || [];
        const template = templates.find((item) => item.slug === 'follow-up');
        if (!template) throw new Error('Template follow-up belum tersedia.');
        sessionStorage.setItem('mynaia.drPawsAssessmentSetup', JSON.stringify({ subjectId, templateId: template.id,
          durationMinutes: 5, professionalNote: '', includeProfessionalNote: false, followUpGoals: plan.goals }));
        location.assign('/dr-paws');
      } catch (error) { notice(error.message); }
    }); card.append(launch); box.append(card);
  }
  if (!data.plans?.length) box.append(node('p','Belum ada rencana follow-up.','muted'));
  if (data.analysis?.result?.recommended_follow_up?.length && !$('#plan-goals').value)
    $('#plan-goals').value = data.analysis.result.recommended_follow_up.join('\n');
}
function renderReport() {
  const box = $('#report'); box.replaceChildren(); const report = data.report;
  if (!report) { box.append(node('p','Belum ada laporan. Buat analisis longitudinal dahulu.','muted')); return; }
  box.append(node('p', `${report.status.toUpperCase()} · versi ${report.version} · ${report.content.verification_status || 'AI_PRELIMINARY'}`));
  if (data.analysisStale) box.append(node('p','Sumber berubah sejak analisis dibuat. Perbarui sebelum memakai laporan.','stale'));
  const form = node('form'); const interpretationLabel = node('label','Interpretasi profesional');
  const interpretation = node('textarea'); interpretation.rows = 5;
  interpretation.value = report.content.professional_interpretation || ''; interpretationLabel.append(interpretation);
  const notesLabel = node('label','Catatan profesional'); const notes = node('textarea'); notes.rows = 3;
  notes.value = report.professional_notes || ''; notesLabel.append(notes);
  const confirmLabel = node('label','Saya secara eksplisit mengonfirmasi redaksi laporan; ini bukan konfirmasi lisensi atau diagnosis otomatis.','confirm-review');
  const confirm = node('input'); confirm.type = 'checkbox'; confirmLabel.prepend(confirm);
  form.append(interpretationLabel,notesLabel,confirmLabel);
  const actions = node('div','', 'report-actions');
  for (const [status,label] of [['draft','Simpan draf'],['reviewed','Tandai reviewed'],['final','Finalisasi']]) {
    if (status === 'final' && report.status === 'draft') continue;
    const button = node('button',label,status === 'draft' ? 'secondary' : ''); button.type = 'button';
    button.addEventListener('click', async () => { try { await api('report-save', { method:'POST', body: {
      reviewerId: reviewerId(), version: report.version, status, interpretation: interpretation.value,
      professionalNotes: notes.value, confirmProfessional: status === 'final' && confirm.checked } });
      notice('Laporan dan audit reviewer tersimpan.'); await load(); } catch (error) { notice(error.message); } });
    actions.append(button);
  }
  if (['reviewed','final'].includes(report.status)) { const pdf = node('a','Unduh PDF longitudinal','secondary');
    pdf.href = `/api/dr-paws/case?action=pdf&id=${encodeURIComponent(subjectId)}`; actions.append(pdf); }
  form.append(actions); box.append(form);
}
async function load() {
  try {
    [data, { reviewers }] = await Promise.all([api('case'),api('reviewers', {id:null})]);
    $('#workspace').hidden = false; $('#gate').hidden = true; $('#retry').hidden = true;
    $('#child-name').textContent = data.child.display_name; renderReviewers(); renderSummary(); renderSources();
    renderTimeline(); renderMatrix(); renderAnalysis(); renderHypotheses(); renderPlans(); renderReport();
  } catch (error) { notice('Data belum berhasil dimuat. ' + error.message, true); }
}
async function boot() {
  const response = await apiFetch('/api/access/status', { cache:'no-store' });
  const status = await response.json();
  if (!status.authorized) { $('#gate').hidden = false; $('#workspace').hidden = true; return; }
  await load();
}
$('#login').addEventListener('submit', async (event) => { event.preventDefault(); try {
  const response = await apiFetch('/api/access/login', { method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({code:$('#code').value}) });
  if (!response.ok) throw new Error('Password salah.'); $('#code').value = ''; await boot();
} catch(error) { $('#login-error').textContent = error.message; } });
$('#reviewer').addEventListener('change', () => localStorage.setItem('mynaia.reviewerId',$('#reviewer').value));
$('#reviewer-form').addEventListener('submit', async (event) => { event.preventDefault(); try {
  const created = await api('reviewer', { id:null, method:'POST', body: { displayName:$('#reviewer-name').value,
    professionalRole:$('#reviewer-role').value, organization:$('#reviewer-organization').value,
    credentialNote:$('#reviewer-credential').value } });
  localStorage.setItem('mynaia.reviewerId', created.id); $('#reviewer-form').reset(); notice('Profil reviewer dibuat.'); await load();
} catch(error) { notice(error.message); } });
$('#source-type').addEventListener('change', () => sourceFields($('#source-type').value));
$('#source-form').addEventListener('submit', async (event) => { event.preventDefault(); try {
  const answers = Object.fromEntries([...$('#source-fields').querySelectorAll('[data-field]')].map((input) => [input.dataset.field,input.value]));
  if (editingSource) await api('source-update', { method:'POST', ref:editingSource.id,
    body:{ reviewerId:reviewerId(), version:editingSource.version, answers, notes:$('#source-notes').value } });
  else await api('source', { method:'POST', body:{ reviewerId:reviewerId(), sourceType:$('#source-type').value,
    sourceName:$('#source-name').value, relationship:$('#source-relationship').value,
    observedAt:$('#source-date').value, answers, notes:$('#source-notes').value } });
  editingSource = null; $('#source-form').reset(); $('#source-type').disabled = false; $('#source-name').disabled = false;
  $('#source-relationship').disabled = false; $('#source-date').disabled = false;
  $('#source-form button').textContent = 'Simpan sumber'; $('#source-date').value = new Date().toISOString().slice(0,10);
  sourceFields($('#source-type').value); notice('Sumber tersimpan. Analisis dapat diperbarui secara manual.'); await load();
} catch(error) { notice(error.message); } });
$('#refresh-analysis').addEventListener('click', async () => { const button = $('#refresh-analysis'); button.disabled = true;
  try { const result = await api('refresh', { method:'POST', body:{ reviewerId:reviewerId() } });
    notice(result.unchanged ? 'Sumber belum berubah; analisis sebelumnya tetap berlaku.' : 'Analisis longitudinal diperbarui. Periksa bukti dan review.'); await load();
  } catch(error) { notice(error.message, true); } finally { button.disabled = false; } });
$('#plan-form').addEventListener('submit', async (event) => { event.preventDefault(); try {
  const goals = $('#plan-goals').value.split('\n').map((x) => x.trim()).filter(Boolean);
  await api('follow-up', { method:'POST', body:{ reviewerId:reviewerId(), goals } });
  notice('Rencana tersimpan; belum ada percakapan Tavus.'); await load();
} catch(error) { notice(error.message); } });
$('#reload').addEventListener('click', load); $('#retry').addEventListener('click', load);
$('#source-date').value = new Date().toISOString().slice(0,10); sourceFields('PARENT');
boot().catch((error) => notice('Data belum berhasil dimuat. ' + error.message, true));

installNativeNavigation();
