import PDFDocument from 'pdfkit';
import { REPORT_DISCLAIMER, AssessmentError } from './assessments.mjs';

const safe = (value) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim();
const hypothesisStatus = (value) => ({ possible: 'mungkin; perlu verifikasi',
  insufficient_evidence: 'bukti belum cukup', not_supported: 'tidak didukung dalam sesi ini' })[value] || 'bukti belum cukup';
const reviewDecision = (value) => ({ pending: 'belum diputuskan', accept_for_assessment: 'terima untuk asesmen lanjut',
  revise: 'direvisi', reject: 'ditolak', insufficient_evidence: 'bukti belum cukup' })[value] || 'belum diputuskan';
export function verificationBanner(detail) {
  const verification = detail?.report?.content?.verification_status || 'AI_PRELIMINARY';
  if (verification === 'AI_PRELIMINARY' || detail?.report?.status === 'draft')
    return 'IMPRESI SEMENTARA - BELUM DIVERIFIKASI PROFESIONAL';
  if (verification === 'PROFESSIONAL_REVISED') return 'Telah Ditinjau Profesional - Redaksi Direvisi';
  if (verification === 'PROFESSIONAL_CONFIRMED') return 'Telah Ditinjau Profesional - Redaksi Dikonfirmasi';
  return 'Telah Ditinjau Profesional';
}

export async function renderAssessmentPdf(detail) {
  const report = detail?.report;
  if (!report || !['draft','reviewed','final'].includes(report.status))
    throw new AssessmentError('REPORT_NOT_READY', 'Laporan belum tersedia.', 409);
  const data = report.content;
  const doc = new PDFDocument({ size: 'A4', margin: 52, info: { Title: 'Laporan Dr. Paws', Author: 'MyNaiA' },
    autoFirstPage: true });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const complete = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  const heading = (title) => {
    if (doc.y > 730) doc.addPage();
    doc.moveDown(0.65).font('Helvetica-Bold').fontSize(12).fillColor('#153145').text(title).moveDown(0.25);
  };
  const paragraph = (value) => { doc.font('Helvetica').fontSize(10).fillColor('#263c49').text(safe(value) || 'Belum cukup informasi.', { lineGap: 3 }).moveDown(0.3); };
  const bullets = (items, format = (x) => x) => {
    if (!items?.length) { paragraph('Belum cukup informasi.'); return; }
    for (const item of items) paragraph(`- ${safe(format(item))}`);
  };
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#102d3d').text('DR. PAWS', { align: 'left' });
  doc.font('Helvetica').fontSize(10).fillColor('#566d78').text('IMPRESI KLINIS SEMENTARA / HIPOTESIS DIAGNOSTIK SEMENTARA');
  const verification = data.verification_status || 'AI_PRELIMINARY';
  const badge = verificationBanner(detail);
  doc.moveDown(0.5).font('Helvetica-Bold').fontSize(12).fillColor(verification === 'AI_PRELIMINARY' || report.status === 'draft' ? '#a3482f' : '#20644c').text(badge);
  doc.moveDown(0.5).moveTo(52, doc.y).lineTo(543, doc.y).strokeColor('#bfd2d9').stroke();
  heading('1. Identitas Sesi');
  const when = data.identity?.date ? new Date(data.identity.date).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' }) : '—';
  for (const line of [`Anak: ${safe(data.identity?.child)}`, `Tanggal: ${when}`,
    `Durasi rencana: ${safe(data.identity?.duration_minutes)} menit`,
    `Template: ${safe(data.identity?.template)} (v${safe(data.identity?.template_version)})`,
    `Status: ${report.status.toUpperCase()} | Revisi: ${report.version}`])
    doc.font('Helvetica').fontSize(10).fillColor('#263c49').text(line, { lineGap: 2 });
  heading('2. Tujuan'); paragraph(data.purpose);
  heading('3. Ringkasan Percakapan'); paragraph(data.summary);
  heading('4. Area yang Dieksplorasi'); bullets(data.domains, (item) => `${item.domain}: ${item.coverage}`);
  heading('5. Kekuatan / Hal Positif'); bullets(data.strengths, (item) => `${item.text} (giliran ${item.evidence_turns?.join(', ') || '-'})`);
  heading('6. Temuan Observasional'); bullets(data.observations, (item) => `${item.domain}: ${item.text} (giliran ${item.evidence_turns?.join(', ') || '-'})`);
  heading('7. Kesimpulan & Impresi Sementara'); paragraph(data.conclusion || 'Belum cukup data untuk membentuk hipotesis spesifik.');
  bullets(data.patterns, (item) => `Pola: ${item}`);
  heading('8. Hipotesis yang Perlu Diverifikasi');
  if (!data.working_hypotheses?.length) paragraph('Belum cukup data untuk membentuk hipotesis spesifik.');
  for (const item of data.working_hypotheses || []) {
    const review = item.professional_review || {};
    const label = review.decision === 'revise' ? review.revised_label : item.label;
    const rationale = review.decision === 'revise' ? review.revised_rationale : item.rationale;
    paragraph(`${label} [${hypothesisStatus(item.status)}; keputusan reviewer: ${reviewDecision(review.decision)}]. ${rationale}`);
    if (review.note) paragraph(`Catatan reviewer: ${review.note}`);
  }
  heading('9. Bukti Pendukung');
  for (const item of data.working_hypotheses || []) {
    paragraph(item.professional_review?.decision === 'revise' ? item.professional_review.revised_label : item.label);
    bullets(item.supporting_evidence, (entry) => `Laporan anak giliran ${entry.evidence_turns?.join(', ') || '-'}: ${(entry.excerpts || []).join(' | ')}`);
    if (item.counter_evidence?.length) bullets(item.counter_evidence, (entry) => `Bukti yang tidak sejalan, giliran ${entry.evidence_turns?.join(', ') || '-'}: ${(entry.excerpts || []).join(' | ')}`);
  }
  if (!data.working_hypotheses?.length) paragraph('Tidak ada hipotesis dengan bukti transkrip yang cukup.');
  heading('10. Data yang Masih Dibutuhkan');
  bullets([...new Set([...(data.insufficient || []), ...(data.working_hypotheses || []).flatMap((item) => item.missing_information || [])])]);
  const sources = data.information_sources || {};
  for (const [label, key] of [['Laporan anak','child_self_report'],['Informasi orang tua','parent_information'],
    ['Informasi guru','teacher_information'],['Observasi profesional','professional_observation'],
    ['Observasi percakapan AI','ai_conversation_observation']]) paragraph(`${label}: ${sources[key] || 'Belum tersedia.'}`);
  heading('11. Alternatif Penjelasan'); bullets([...new Set((data.working_hypotheses || []).flatMap((item) => item.alternative_explanations || []))]);
  heading('12. Rekomendasi Tindak Lanjut'); bullets(data.follow_up);
  if (data.safety_review?.recommended) { heading('Perlu tinjauan keselamatan oleh orang dewasa'); paragraph(data.safety_review.reason); }
  heading('13. Catatan Profesional'); paragraph(report.professional_notes || 'Tidak ada catatan tambahan.');
  heading('14. Status Verifikasi'); paragraph(`${verification}: ${badge}`);
  heading('15. Disclaimer'); bullets(data.limitations); paragraph(REPORT_DISCLAIMER);
  doc.end();
  return complete;
}
