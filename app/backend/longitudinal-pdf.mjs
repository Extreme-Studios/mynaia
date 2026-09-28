import PDFDocument from 'pdfkit';
import { CaseError } from './longitudinal.mjs';

const safe = (value) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim();
export async function renderLongitudinalPdf(detail) {
  const report = detail?.report;
  if (!report || !['reviewed','final'].includes(report.status))
    throw new CaseError('REPORT_NOT_REVIEWED', 'PDF longitudinal tersedia setelah review manusia.', 409);
  const data = report.content || {};
  const doc = new PDFDocument({ size: 'A4', margin: 48,
    info: { Title: 'Dr. Paws - Laporan Longitudinal', Author: 'MyNaiA' } });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const complete = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  const heading = (title) => { if (doc.y > 730) doc.addPage();
    doc.moveDown(0.6).font('Helvetica-Bold').fontSize(11.5).fillColor('#153145').text(title).moveDown(0.25); };
  const paragraph = (value) => doc.font('Helvetica').fontSize(9.5).fillColor('#263c49')
    .text(safe(value) || 'Belum tersedia.', { lineGap: 3 }).moveDown(0.27);
  const bullets = (items, format = (x) => x) => {
    if (!items?.length) { paragraph('Belum tersedia.'); return; }
    for (const item of items) paragraph(`- ${safe(format(item))}`);
  };
  doc.font('Helvetica-Bold').fontSize(19).fillColor('#102d3d').text('MYNAIA / DR. PAWS');
  doc.font('Helvetica').fontSize(10).fillColor('#566d78').text('LAPORAN LONGITUDINAL - DUKUNGAN PENILAIAN PROFESIONAL');
  const warning = report.status === 'final' && data.verification_status === 'PROFESSIONAL_CONFIRMED' ?
    'Telah Ditinjau dan Dikonfirmasi Reviewer' : 'IMPRESI SEMENTARA - BUKAN DIAGNOSIS FINAL';
  doc.moveDown(0.4).font('Helvetica-Bold').fontSize(12).fillColor('#a3482f').text(warning);
  heading('1. Informasi Anak / Kasus'); paragraph(`Nama tampilan: ${detail.child?.display_name || data.child_name || '-'}`);
  heading('2. Periode Penilaian'); paragraph(`${safe(data.period_start)} sampai ${safe(data.period_end)}`);
  heading('3. Sumber yang Ditinjau');
  for (const [key, label] of [['CHILD','Percakapan anak'],['PARENT','Laporan orang tua'],['TEACHER','Laporan guru'],
    ['PROFESSIONAL','Observasi profesional']]) paragraph(`${label}: ${detail.sourceCoverage?.[key] ? 'tersedia' : 'belum tersedia'}`);
  heading('4. Riwayat Sesi'); bullets(data.session_history, (item) => `${item.date}: ${item.template} (${item.status})`);
  heading('5. Kekuatan yang Teramati'); bullets(data.strengths, (item) => `${item.text} [${item.evidence_refs?.join(', ')}]`);
  heading('6. Pola Berulang'); bullets(data.patterns, (item) => `${item.title} (${item.status}; ${item.evidence_strength}). ${item.description} [${item.supporting_refs?.join(', ')}]`);
  heading('7. Perubahan dari Waktu ke Waktu'); bullets(data.changes, (item) => `${item.description} [awal: ${item.earlier_refs?.join(', ')}; akhir: ${item.later_refs?.join(', ')}]`);
  heading('8. Bukti yang Berbeda / Bertentangan'); bullets(data.contradictions, (item) => `${item.description} [${item.evidence_refs?.join(', ')}]`);
  heading('9. Hipotesis Kerja Saat Ini'); bullets(data.current_working_hypotheses, (item) =>
    `${item.review?.wording || item.label} (${item.status}; ${item.evidence_strength}). ${item.rationale} ` +
    `Pendukung: ${item.supporting_refs?.join(', ')}. Tidak sejalan: ${item.counter_refs?.join(', ') || '-'}; ` +
    `Data kurang: ${item.missing_information?.join('; ') || '-'}; Alternatif: ${item.alternative_explanations?.join('; ') || '-'}.`);
  heading('10. Informasi yang Masih Dibutuhkan'); bullets(data.missing_information);
  heading('11. Interpretasi Profesional'); paragraph(data.professional_interpretation || 'Belum ditambahkan.');
  heading('12. Rekomendasi Tindak Lanjut'); bullets(data.recommended_follow_up);
  heading('13. Status Verifikasi');
  paragraph(`${data.verification_status || 'AI_PRELIMINARY'}; status laporan: ${report.status.toUpperCase()}; versi ${report.version}.`);
  if (detail.reviewer) paragraph(`Ditinjau oleh: ${detail.reviewer.display_name}; peran: ${detail.reviewer.professional_role}; tanggal: ${report.reviewed_at || report.finalized_at || '-'}. Kredensial tidak diverifikasi aplikasi.`);
  paragraph(`Catatan reviewer: ${report.professional_notes || 'Tidak ada.'}`);
  heading('14. Batasan'); bullets(data.limitations);
  paragraph('Dokumen ini merupakan analisis longitudinal berbasis informasi yang tersedia pada sistem Dr. Paws. Temuan dan hipotesis di dalamnya belum merupakan diagnosis final dan memerlukan verifikasi profesional.');
  if (detail.stale) paragraph('PERHATIAN: sumber kasus telah berubah sejak analisis ini dibuat; perbarui analisis sebelum menggunakan laporan.');
  doc.end();
  return complete;
}
