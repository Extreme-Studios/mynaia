import { CaseError } from './longitudinal.mjs';
import { renderLongitudinalPdf } from './longitudinal-pdf.mjs';

export async function dispatchCaseRequest({ method, action, id, ref, body = {}, service }) {
  if (method === 'GET') {
    if (action === 'reviewers') return { body: { reviewers: await service.reviewers() } };
    if (action === 'case') return { body: await service.caseView(id) };
    if (action === 'evidence') return { body: await service.evidence(id, ref) };
    if (action === 'plan') return { body: await service.plan(id, ref) };
    if (action === 'report') return { body: await service.reportDetail(id) };
    if (action === 'pdf') return { pdf: await renderLongitudinalPdf(await service.reportDetail(id)) };
  }
  if (method === 'POST') {
    if (action === 'reviewer') return { status: 201, body: await service.createReviewer(body) };
    if (action === 'source') return { status: 201, body: await service.createSource(id, body) };
    if (action === 'source-update') return { body: await service.updateSource(id, ref, body) };
    if (action === 'source-delete') return { body: await service.deleteSource(id, ref, body) };
    if (action === 'refresh') return { body: await service.refreshAnalysis(id, body) };
    if (action === 'hypothesis-review') return { body: await service.reviewHypothesis(id, body) };
    if (action === 'safety-review') return { body: await service.reviewSafety(id, body) };
    if (action === 'report-save') return { body: await service.saveReport(id, body) };
    if (action === 'follow-up') return { status: 201, body: await service.createPlan(id, body) };
  }
  throw new CaseError('INVALID_REQUEST', 'Permintaan kasus tidak valid.', 400);
}
