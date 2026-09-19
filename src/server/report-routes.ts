import { registerApiRoute } from '@mastra/core/server';
import { reportDetails } from '../core/report';
import type { AssessmentRepository } from '../storage/assessment-repository';
import type { AssessmentService } from '../application/handle-turn';
import type { Config } from '../config/env';

export function reportRoutes(repository: AssessmentRepository, service: () => Promise<AssessmentService>, config: Config) {
  return [
    registerApiRoute('/ready', { method: 'GET', requiresAuth: false, handler: async c => { await service(); return c.json({ ready: true }); } }),
    registerApiRoute('/api/reports/:token', { method: 'GET', requiresAuth: false, handler: async c => {
      c.header('Cache-Control', 'no-store'); c.header('Referrer-Policy', 'no-referrer'); c.header('X-Content-Type-Options', 'nosniff');
      await service();
      const snapshot = await repository.getReport(c.req.param('token'));
      return snapshot ? c.json({ report: snapshot.report, cards: reportDetails(snapshot.report), text: snapshot.text }) : c.json({ error: 'report_unavailable' }, 404);
    } }),
    registerApiRoute('/api/public/config', { method: 'GET', requiresAuth: false, handler: async c => c.json({ botUsername: config.TELEGRAM_BOT_USERNAME ?? null, retentionDays: config.RETENTION_DAYS }) }),
    registerApiRoute('/api/public/evidence', { method: 'GET', requiresAuth: false, handler: async c => c.json({ status: 'not_run', runs: [], note: 'Live Galtea evaluation has not yet been completed. No benchmark results are claimed.' }) }),
  ];
}
