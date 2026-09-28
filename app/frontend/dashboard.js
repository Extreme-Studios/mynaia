const $ = (selector) => document.querySelector(selector);
const make = (tag, text = '', className = '') => { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; };
const date = (value) => value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
let dashboard, templates, selectedDetail;
const verificationLabel = (status) => ({ AI_PRELIMINARY: 'BELUM DIVERIFIKASI PROFESIONAL',
  PROFESSIONAL_REVIEWED: 'Telah Ditinjau Profesional', PROFESSIONAL_CONFIRMED: 'Telah Dikonfirmasi Profesional',
  PROFESSIONAL_REVISED: 'Telah Direvisi Profesional' })[status] || 'BELUM DIVERIFIKASI PROFESIONAL';
const hypothesisStatusLabel = (status) => ({ possible: 'Mungkin; perlu verifikasi',
  insufficient_evidence: 'Bukti belum cukup', not_supported: 'Tidak didukung dalam sesi ini' })[status] || 'Bukti belum cukup';
function evidenceLinks(container, items = []) {
  for (const item of items) {
    const line = make('p', (item.excerpts || []).join(' · ') || 'Lihat transkrip');
    for (const turn of item.evidence_turns || []) {
      const link = make('a', `Bukti #${turn}`, 'evidence'); link.href = `#turn-${turn}`;
      link.addEventListener('click', () => { const disclosure = document.querySelector('#detail .transcript')?.closest('details'); if (disclosure) disclosure.open = true; });
      line.append(link);
    }
    container.append(line);
  }
}

async function api(action, { id, method = 'GET', body } = {}) {
  const query = new URLSearchParams({ action, ...(id ? { id } : {}) });
  const response = await fetch(`/api/dr-paws/assessment?${query}`, { method, cache: 'no-store',
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
async function caseApi(action, body) {
  const response = await fetch(`/api/dr-paws/case?action=${encodeURIComponent(action)}`, { method: body ? 'POST' : 'GET', cache: 'no-store',
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function notice(message) { $('#notice').hidden = false; $('#notice').textContent = message; }
function cardText(container, title, lines = []) {
  const card = make('div', '', 'item'); card.append(make('strong', title));
  for (const line of lines) if (line) card.append(make('p', line));
  container.append(card); return card;
}
async function refresh() {
  let reviewerData;
  [dashboard, { templates }, reviewerData] = await Promise.all([api('dashboard'), api('templates'), caseApi('reviewers')]);
  const reviewerSelect = $('#reviewer'), storedReviewer = localStorage.getItem('mynaia.reviewerId');
  reviewerSelect.replaceChildren(new Option('Pilih reviewer', ''));
  for (const item of reviewerData.reviewers) reviewerSelect.add(new Option(`${item.display_name} · ${item.professional_role}`, item.id));
  if (reviewerData.reviewers.some((item) => item.id === storedReviewer)) reviewerSelect.value = storedReviewer;
  const stats = $('#overview'); stats.replaceChildren();
  for (const [label, value] of [['Profil anak', dashboard.counts.children], ['Perlu diproses', dashboard.counts.pending],
    ['Draf laporan', dashboard.counts.draft], ['Sudah ditinjau', dashboard.counts.reviewed]]) {
    const box = make('div', '', 'stat'); box.append(make('span', label), make('strong', String(value))); stats.append(box);
  }
  const childSelect = $('#child'); childSelect.replaceChildren(new Option('Pilih profil anak', ''));
  const children = $('#children'); children.replaceChildren();
  for (const child of dashboard.children) {
    childSelect.add(new Option(child.nickname || child.display_name, child.id));
    const card = cardText(children, child.display_name, [child.nickname ? `Panggilan: ${child.nickname}` : '']);
    const button = make('button', 'Lihat profil', 'secondary'); button.type = 'button';
    button.addEventListener('click', () => showChild(child.id)); card.append(button);
    const caseLink = make('a', 'Buka kasus longitudinal', 'secondary'); caseLink.href = `/dr-paws/dashboard/subjects/${encodeURIComponent(child.id)}`; card.append(caseLink);
  }
  if (!dashboard.children.length) children.append(make('p', 'Belum ada profil. Tambahkan profil melalui layar Dr. Paws.', 'muted'));
  const templateSelect = $('#template'); templateSelect.replaceChildren(new Option('Pilih template', ''));
  for (const template of templates) templateSelect.add(new Option(template.name, template.id));
  const sessions = $('#sessions'); sessions.replaceChildren();
  for (const session of dashboard.sessions) {
    const card = cardText(sessions, `${session.child_name} · ${session.template_snapshot?.name || 'Sesi terstruktur'}`,
      [date(session.created_at), `${session.planned_duration_minutes} menit · ${session.status}`, session.summary]);
    const pill = make('span', session.report_status || 'Laporan menunggu', 'pill'); card.append(pill);
    const button = make('button', 'Lihat sesi', 'secondary'); button.type = 'button'; button.addEventListener('click', () => showSession(session.id)); card.append(button);
    const caseLink = make('a', 'Lihat kasus', 'secondary'); caseLink.href = `/dr-paws/dashboard/subjects/${encodeURIComponent(session.subject_id)}`; card.append(caseLink);
  }
  if (!dashboard.sessions.length) sessions.append(make('p', 'Belum ada sesi terstruktur.', 'muted'));
  const requestedSession = new URLSearchParams(location.search).get('session');
  if (requestedSession && dashboard.sessions.some((item) => item.id === requestedSession)) {
    history.replaceState(null, '', '/dr-paws/dashboard');
    await showSession(requestedSession);
  }
}
async function showChild(id) {
  const data = await api('child', { id });
  const box = $('#child-profile'); box.hidden = false; box.replaceChildren(make('h3', data.subject.display_name));
  box.append(make('p', data.consent.consented ? `Persetujuan dicatat: ${date(data.consent.record.consent_timestamp)}` : 'Belum ada persetujuan sesi terstruktur.'));
  box.append(make('p', `Free chat tercatat: ${data.free_chat_count}`));
  box.append(make('h3', 'Ringkasan terbaru'));
  for (const item of data.summaries) box.append(make('p', `${date(item.created_at)} — ${item.summary}`));
  box.append(make('h3', 'Topik terbuka'));
  for (const item of data.open_topics) box.append(make('p', item.content));
  box.append(make('h3', 'Riwayat sesi'));
  for (const session of data.sessions) {
    const button = make('button', `${date(session.created_at)} · ${session.template_snapshot.name} · ${session.status}`, 'secondary');
    button.type = 'button'; button.addEventListener('click', () => showSession(session.id)); box.append(button);
  }
  const removal = make('details'); removal.append(make('summary', 'Hapus profil dan seluruh arsip Dr. Paws'));
  removal.append(make('p', 'Menghapus profil, transkrip, memori, persetujuan, analisis, dan laporan dari Supabase. Data pada akun Tavus tidak dihapus otomatis.'));
  const deleteButton = make('button', 'Hapus profil dan data', 'secondary'); deleteButton.type = 'button';
  deleteButton.addEventListener('click', async () => {
    const confirmation = window.prompt(`Untuk menghapus seluruh data ${data.subject.display_name}, ketik HAPUS PROFIL DAN DATA`);
    if (confirmation !== 'HAPUS PROFIL DAN DATA') return;
    try { await api('delete-child', { id, method: 'POST', body: { confirmation } });
      $('#child-profile').hidden = true; notice('Profil dan arsip Supabase dihapus.'); await refresh(); }
    catch (error) { notice(error.message); }
  });
  removal.append(deleteButton); box.append(removal);
  $('#child').value = id;
  await checkConsent();
}
async function checkConsent() {
  const id = $('#child').value;
  if (!id) { $('#consent-panel').hidden = true; return; }
  const status = await api('consent', { id });
  $('#consent-panel').hidden = status.consented;
}
$('#child').addEventListener('change', () => checkConsent().catch((error) => notice(error.message)));
$('#setup').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const subjectId = $('#child').value;
    const templateId = $('#template').value;
    if (!subjectId || !templateId) throw new Error('Pilih profil dan template.');
    if (!$('#consent-panel').hidden) {
      if (!$('#consent-check').checked) throw new Error('Persetujuan orang dewasa diperlukan.');
      await api('consent', { method: 'POST', body: { subjectId, actor: $('#consent-actor').value, accepted: true } });
    }
    sessionStorage.setItem('mynaia.drPawsAssessmentSetup', JSON.stringify({ subjectId, templateId,
      durationMinutes: Number($('#duration').value), professionalNote: $('#session-note').value,
      includeProfessionalNote: $('#include-note').checked }));
    location.assign('/dr-paws');
  } catch (error) { notice(error.message); }
});
$('#custom-template').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const domains = $('#custom-domains').value.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const [domain, goal, example] = line.split('|').map((part) => part.trim()); return { domain, goal, example };
    });
    await api('template', { method: 'POST', body: { name: $('#custom-name').value, purpose: $('#custom-purpose').value, domains } });
    $('#custom-template').reset(); notice('Template tersimpan.'); await refresh();
  } catch (error) { notice(error.message); }
});
async function showSession(id) {
  selectedDetail = await api('session', { id });
  const panel = $('#detail-panel'); panel.hidden = false;
  const box = $('#detail'); box.replaceChildren();
  const { session, subject, conversation, transcript, analysis, report } = selectedDetail;
  box.append(make('p', `${subject.display_name} · ${session.template_snapshot.name} v${session.template_version} · ${date(session.created_at)}`));
  box.append(make('p', `Status: ${session.status} · Transkrip: ${conversation.transcript_status} · Memori: ${conversation.memory_status}`));
  if (session.status === 'analysis_failed' || session.status === 'transcript_pending') {
    const retry = make('button', 'Coba proses ulang tanpa sesi Tavus baru'); retry.type = 'button';
    retry.addEventListener('click', async () => { retry.disabled = true; try { const result = await api('retry', { id, method: 'POST' }); notice(`Pemrosesan: ${result.status}`); await refresh(); await showSession(id); } catch (error) { notice(error.message); } finally { retry.disabled = false; } });
    box.append(retry);
  }
  if (analysis?.result) {
    const a = analysis.result;
    box.append(make('h3', 'Analisis observasi (AI)'));
    box.append(make('p', a.session_summary));
    box.append(make('h3', 'Kesimpulan & Impresi Sementara'));
    box.append(make('p', 'BELUM DIVERIFIKASI PROFESIONAL', 'verification preliminary'));
    box.append(make('p', a.overall_impression || 'Belum cukup data untuk membentuk hipotesis spesifik.'));
    for (const pattern of a.observed_patterns || []) box.append(make('p', `Pola: ${pattern}`));
    for (const hypothesis of a.working_hypotheses || []) {
      box.append(make('h4', `${hypothesis.label} · ${hypothesisStatusLabel(hypothesis.status)}`));
      box.append(make('p', hypothesis.rationale));
      box.append(make('strong', 'Bukti pendukung dari laporan anak')); evidenceLinks(box, hypothesis.supporting_evidence);
      if (hypothesis.counter_evidence?.length) { box.append(make('strong', 'Bukti yang tidak sejalan')); evidenceLinks(box, hypothesis.counter_evidence); }
      for (const missing of hypothesis.missing_information || []) box.append(make('p', `Data belum ada: ${missing}`));
      for (const alternative of hypothesis.alternative_explanations || []) box.append(make('p', `Alternatif: ${alternative}`));
    }
    for (const domain of a.domains) {
      box.append(make('h4', `${domain.domain} · ${domain.coverage}`));
      for (const item of domain.observations) {
        const line = make('p', item.text + ' ');
        for (const turn of item.evidence_turns) {
          const link = make('a', `Bukti #${turn}`, 'evidence'); link.href = `#turn-${turn}`;
          link.addEventListener('click', () => { const transcriptPanel = box.querySelector('.transcript')?.closest('details'); if (transcriptPanel) transcriptPanel.open = true; });
          line.append(link);
        }
        box.append(line);
      }
    }
    if (a.safety_review?.recommended) box.append(make('p', `TINJAUAN KESELAMATAN DIREKOMENDASIKAN: ${a.safety_review.reason}`));
  }
  if (report) drawReport(box, selectedDetail);
  const removeSession = make('details'); removeSession.append(make('summary', 'Hapus sesi ini'));
  removeSession.append(make('p', 'Menghapus transkrip, analisis, dan laporan sesi ini dari Supabase. Memori aman yang sudah diekstrak tetap tersimpan tanpa rujukan sumber.'));
  const removeButton = make('button', 'Hapus sesi', 'secondary'); removeButton.type = 'button';
  removeButton.addEventListener('click', async () => {
    const confirmation = window.prompt('Untuk menghapus sesi ini, ketik HAPUS SESI');
    if (confirmation !== 'HAPUS SESI') return;
    try { await api('delete-session', { id, method: 'POST', body: { confirmation } });
      $('#detail-panel').hidden = true; notice('Sesi dihapus dari Supabase.'); await refresh(); }
    catch (error) { notice(error.message); }
  });
  removeSession.append(removeButton); box.append(removeSession);
  const disclosure = make('details'); const summary = make('summary', `Baca transkrip (${transcript.length} giliran)`); disclosure.append(summary);
  const turns = make('div', '', 'transcript');
  for (const turn of transcript) {
    const node = make('div', '', `turn ${turn.role}`); node.id = `turn-${turn.position}`;
    node.append(make('small', `#${turn.position} · ${turn.role === 'assistant' ? 'Dr. Paws' : 'Anak'} · ${turn.spoken_at ? date(turn.spoken_at) : turn.seconds_from_start != null ? `${Math.round(turn.seconds_from_start)} detik` : '—'}`));
    node.append(make('p', turn.content)); turns.append(node);
  }
  disclosure.append(turns); box.append(disclosure);
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function drawReport(box, data) {
  const report = data.report, content = report.content;
  box.append(make('h3', `Laporan ${report.status.toUpperCase()} · revisi ${report.version}`));
  box.append(make('p', verificationLabel(content.verification_status), `verification ${content.verification_status === 'AI_PRELIMINARY' || !content.verification_status ? 'preliminary' : 'reviewed'}`));
  box.append(make('p', content.disclaimer));
  const sources = content.information_sources || {};
  const sourceLabels = [['child_self_report','Laporan anak'],['parent_information','Informasi orang tua'],
    ['teacher_information','Informasi guru'],['professional_observation','Observasi profesional'],
    ['ai_conversation_observation','Observasi percakapan AI']];
  box.append(make('h4', 'Sumber informasi'));
  for (const [key, label] of sourceLabels) box.append(make('p', `${label}: ${sources[key] || 'Belum tersedia.'}`));
  const form = make('form', '', 'report-form');
  const grid = make('div', '', 'report-grid');
  const field = (label, value, rows = 4) => {
    const wrapper = make('label', label); const input = make('textarea'); input.rows = rows; input.value = value || ''; wrapper.append(input); grid.append(wrapper); return input;
  };
  const purpose = field('Tujuan sesi', content.purpose, 2);
  const summary = field('Ringkasan AI (boleh dikoreksi)', content.summary);
  const conclusion = field('Kesimpulan & Impresi Klinis Sementara (boleh dikoreksi)', content.conclusion || 'Belum cukup data untuk membentuk hipotesis spesifik.');
  for (const pattern of content.patterns || []) grid.append(make('p', `Pola teramati: ${pattern}`));
  const insufficient = field('Belum cukup tergali (satu per baris)', (content.insufficient || []).join('\n'), 3);
  const followUp = field('Topik tindak lanjut (satu per baris)', (content.follow_up || []).join('\n'), 3);
  const notes = field('Catatan / interpretasi profesional (terpisah dari hasil AI)', report.professional_notes, 5);
  form.append(grid, make('h4', 'Observasi AI dan bukti transkrip'));
  const edits = [];
  for (const item of content.observations || []) {
    const wrapper = make('label', `${item.domain} · giliran ${item.evidence_turns.join(', ')}`);
    const input = make('textarea'); input.rows = 2; input.value = item.text; wrapper.append(input);
    const remove = make('label', ' Hapus observasi ini'); const checkbox = make('input'); checkbox.type = 'checkbox'; remove.prepend(checkbox); wrapper.append(remove);
    form.append(wrapper); edits.push({ item, input, checkbox });
  }
  form.append(make('h4', 'Hipotesis yang Perlu Diverifikasi'));
  const hypothesisEdits = [];
  if (!(content.working_hypotheses || []).length) form.append(make('p', 'Belum cukup data untuk membentuk hipotesis spesifik.'));
  for (const item of content.working_hypotheses || []) {
    const wrapper = make('div', '', 'hypothesis-review');
    wrapper.append(make('strong', `${item.label} · ${hypothesisStatusLabel(item.status)}`), make('p', item.rationale));
    wrapper.append(make('strong', 'Bukti pendukung')); evidenceLinks(wrapper, item.supporting_evidence);
    if (item.counter_evidence?.length) { wrapper.append(make('strong', 'Bukti yang tidak sejalan')); evidenceLinks(wrapper, item.counter_evidence); }
    wrapper.append(make('p', `Data belum ada: ${(item.missing_information || []).join('; ') || 'Perlu penggalian lanjutan.'}`));
    wrapper.append(make('p', `Alternatif: ${(item.alternative_explanations || []).join('; ') || 'Belum dicatat.'}`));
    const decisionLabel = make('label', 'Keputusan reviewer'); const decision = make('select');
    for (const [value, label] of [['pending','Belum diputuskan'],['accept_for_assessment','Terima untuk asesmen lanjut'],
      ['revise','Revisi'],['reject','Tolak'],['insufficient_evidence','Bukti tidak cukup']]) decision.add(new Option(label, value));
    decision.value = item.professional_review?.decision || 'pending'; decisionLabel.append(decision);
    const noteLabel = make('label', 'Catatan profesional'); const note = make('textarea'); note.rows = 2;
    note.value = item.professional_review?.note || ''; noteLabel.append(note);
    const labelField = make('label', 'Label revisi (jika memilih Revisi)'); const revisedLabel = make('input');
    revisedLabel.value = item.professional_review?.revised_label || ''; labelField.append(revisedLabel);
    const rationaleField = make('label', 'Alasan revisi (jika memilih Revisi)'); const revisedRationale = make('textarea');
    revisedRationale.rows = 2; revisedRationale.value = item.professional_review?.revised_rationale || ''; rationaleField.append(revisedRationale);
    wrapper.append(decisionLabel, noteLabel, labelField, rationaleField); form.append(wrapper);
    hypothesisEdits.push({ item, decision, note, revisedLabel, revisedRationale });
  }
  const confirmLabel = make('label', 'Saya telah meninjau seluruh laporan dan mengonfirmasi redaksi profesional ini; ini bukan diagnosis otomatis.', 'confirm-review');
  const confirm = make('input'); confirm.type = 'checkbox'; confirmLabel.prepend(confirm);
  if (report.status !== 'draft') form.append(confirmLabel);
  const actions = make('div', '', 'report-actions');
  for (const [status, label] of [['draft','Simpan draf'], ['reviewed','Tandai reviewed'], ['final','Finalisasi']]) {
    if (status === 'final' && report.status === 'draft') continue;
    const button = make('button', label, status === 'draft' ? 'secondary' : ''); button.type = 'button';
    button.addEventListener('click', async () => {
      try {
        const lines = (value) => value.split('\n').map((s) => s.trim()).filter(Boolean);
        const reviewerId = $('#reviewer').value;
        if (!reviewerId) throw new Error('Pilih atau buat profil reviewer sebelum menyimpan laporan.');
        await api('report', { id: data.session.id, method: 'POST', body: { version: report.version, status, reviewerId,
          confirmProfessional: status === 'final' && confirm.checked,
          professionalNotes: notes.value, content: { purpose: purpose.value, summary: summary.value,
            conclusion: conclusion.value, insufficient: lines(insufficient.value), follow_up: lines(followUp.value),
            working_hypotheses: hypothesisEdits.map(({ item, decision, note, revisedLabel, revisedRationale }) => ({ ...item,
              professional_review: { decision: decision.value, note: note.value,
                revised_label: revisedLabel.value, revised_rationale: revisedRationale.value } })),
            observations: edits.filter((e) => !e.checkbox.checked).map((e) => ({ ...e.item, text: e.input.value })) } } });
        notice('Laporan tersimpan.'); await refresh(); await showSession(data.session.id);
      } catch (error) { notice(error.message); }
    }); actions.append(button);
  }
  const pdf = make('a', 'Unduh PDF', 'secondary'); pdf.href = `/api/dr-paws/assessment?action=pdf&id=${encodeURIComponent(data.session.id)}`; actions.append(pdf);
  form.append(actions); box.append(form);
  if (data.revisions.length) box.append(make('p', `Riwayat revisi: ${data.revisions.map((r) => `v${r.version} ${r.previous_status}`).join(' · ')}`, 'muted'));
}
$('#close-detail').addEventListener('click', () => { $('#detail-panel').hidden = true; });
$('#reviewer').addEventListener('change', () => localStorage.setItem('mynaia.reviewerId', $('#reviewer').value));
$('#reviewer-form').addEventListener('submit', async (event) => { event.preventDefault(); try {
  const result = await caseApi('reviewer', { displayName: $('#reviewer-name').value, professionalRole: $('#reviewer-role').value });
  localStorage.setItem('mynaia.reviewerId', result.id); $('#reviewer-form').reset(); await refresh(); notice('Profil reviewer tersimpan.');
} catch (error) { notice(error.message); } });
$('#retry').addEventListener('click', () => refresh().then(() => { $('#retry').hidden = true; }).catch((error) => notice(`Data belum berhasil dimuat. ${error.message}`)));
$('#login').addEventListener('submit', async (event) => {
  event.preventDefault(); $('#login-error').textContent = '';
  try {
    const response = await fetch('/api/access/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: $('#code').value }) });
    if (!response.ok) throw new Error('Password salah.');
    $('#code').value = ''; await boot();
  } catch (error) { $('#login-error').textContent = error.message; }
});
async function boot() {
  const status = await (await fetch('/api/access/status', { cache: 'no-store' })).json();
  if (!status.authorized) { $('#gate').hidden = false; $('#workspace').hidden = true; return; }
  $('#gate').hidden = true; $('#workspace').hidden = false;
  try { await refresh(); $('#consent-panel').hidden = true; }
  catch (error) { notice(`Data belum berhasil dimuat. ${error.message}`); $('#retry').hidden = false; }
}
boot().catch((error) => { $('#login-error').textContent = error.message; });
