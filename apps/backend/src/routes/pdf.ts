import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { db } from '@teacher-score/db';
import * as schema from '@teacher-score/db/schema';
import { sendJob, JOB_GENERATE_PDF, type GeneratePdfPayload } from '../boss';

export const pdfRoute = new Hono();

pdfRoute.post('/grading/:id', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const id = c.req.param('id');

  const rows = await db
    .select()
    .from(schema.gradingRecords)
    .where(and(eq(schema.gradingRecords.id, id), eq(schema.gradingRecords.organizationId, orgId)))
    .limit(1);
  if (rows.length === 0) return c.json({ error: 'not_found' }, 404);
  if (rows[0]!.status !== 'completed') return c.json({ error: 'not_completed' }, 400);

  const payload: GeneratePdfPayload = {
    organizationId: orgId,
    kind: 'grading-report',
    gradingId: id,
  };
  await sendJob(JOB_GENERATE_PDF, payload);
  return c.json({ ok: true }, 202);
});
