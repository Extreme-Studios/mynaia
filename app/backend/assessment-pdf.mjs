import PDFDocument from 'pdfkit';
import { REPORT_DISCLAIMER, AssessmentError } from './assessments.mjs';

const safe = (value) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim();

export async function renderAssessmentPdf(detail) {
  const report = detail?.report;
  if (!report || !['reviewed','final'].includes(report.status))
    throw new AssessmentError('REPORT_NOT_REVIEWED', 'PDF tersedia setelah laporan ditinjau.', 409);
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
  doc.font('Helvetica').fontSize(10).fillColor('#566d78').text('LAPORAN OBSERVASI PERCAKAPAN');
  doc.moveDown(0.5).moveTo(52, doc.y).lineTo(543, doc.y).strokeColor('#bfd2d9').stroke();
  heading('Identitas sesi');
  const when = data.identity?.date ? new Date(data.identity.date).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' }) : '—';
  for (const line of [`Anak: ${safe(data.identity?.child)}`, `Tanggal: ${when}`,
    `Durasi rencana: ${safe(data.identity?.duration_minutes)} menit`,
    `Template: ${safe(data.identity?.template)} (v${safe(data.identity?.template_version)})`,
    `Status: ${report.status.toUpperCase()} | Revisi: ${report.version}`])
    doc.font('Helvetica').fontSize(10).fillColor('#263c49').text(line, { lineGap: 2 });
  heading('Tujuan sesi'); paragraph(data.purpose);
  heading('Ringkasan percakapan'); paragraph(data.summary);
  heading('Area yang dieksplorasi'); bullets(data.domains, (item) => `${item.domain}: ${item.coverage}`);
  heading('Kekuatan yang teramati'); bullets(data.strengths, (item) => `${item.text} (giliran ${item.evidence_turns?.join(', ') || '-'})`);
  heading('Catatan observasi'); bullets(data.observations, (item) => `${item.domain}: ${item.text} (giliran ${item.evidence_turns?.join(', ') || '-'})`);
  heading('Hal yang belum cukup tergali'); bullets(data.insufficient);
  heading('Topik tindak lanjut'); bullets(data.follow_up);
  if (data.safety_review?.recommended) { heading('Perlu tinjauan keselamatan oleh orang dewasa'); paragraph(data.safety_review.reason); }
  heading('Catatan profesional'); paragraph(report.professional_notes || 'Tidak ada catatan tambahan.');
  heading('Batasan'); bullets(data.limitations);
  doc.moveDown(0.8).font('Helvetica-Oblique').fontSize(9).fillColor('#536b76').text(REPORT_DISCLAIMER);
  doc.end();
  return complete;
}
