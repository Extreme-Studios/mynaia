import { AssessmentError } from './assessments.mjs';
import { renderAssessmentPdf } from './assessment-pdf.mjs';

export async function dispatchAssessmentRequest({ method, action, id, body = {}, service, drMemory }) {
  if (method === 'GET') {
    if (action === 'dashboard') return { body: await service.dashboard() };
    if (action === 'templates') return { body: { templates: await service.templates() } };
    if (action === 'child') return { body: await service.childProfile(id) };
    if (action === 'session') return { body: await service.detail(id) };
    if (action === 'consent') return { body: await service.consentStatus(id) };
    if (action === 'pdf') return { pdf: await renderAssessmentPdf(await service.detail(id)) };
  }
  if (method === 'POST') {
    if (action === 'template') return { status: 201, body: await service.createTemplate(body) };
    if (action === 'consent') return { body: await service.giveConsent(body) };
    if (action === 'retry') return { body: await service.process(id, drMemory) };
    if (action === 'report') return { body: await service.saveReport(id, body) };
    if (action === 'delete-session') return { body: await service.deleteSession(id, body.confirmation) };
    if (action === 'delete-child') return { body: await service.deleteChild(id, body.confirmation) };
  }
  throw new AssessmentError('INVALID_REQUEST', 'Permintaan assessment tidak valid.', 400);
}
