import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { db } from '@teacher-score/db';
import * as schema from '@teacher-score/db/schema';

export const mistakesRoute = new Hono();

mistakesRoute.get('/', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const rows = await db
    .select()
    .from(schema.mistakeCollection)
    .where(eq(schema.mistakeCollection.organizationId, orgId))
    .orderBy(desc(schema.mistakeCollection.occurrences), desc(schema.mistakeCollection.lastSeenAt))
    .limit(200);
  return c.json({ mistakes: rows });
});

mistakesRoute.post('/:id/master', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const id = c.req.param('id');
  const updated = await db
    .update(schema.mistakeCollection)
    .set({ mastered: true, masteredAt: new Date() })
    .where(eq(schema.mistakeCollection.id, id))
    .returning();
  if (updated.length === 0 || updated[0]!.organizationId !== orgId) {
    return c.json({ error: 'not_found' }, 404);
  }
  return c.json({ ok: true });
});
