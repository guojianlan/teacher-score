import { Hono } from 'hono';
import { z } from 'zod';
import { ulid } from 'ulid';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@teacher-score/db';
import * as schema from '@teacher-score/db/schema';

export const classesRoute = new Hono();

const createSchema = z.object({
  name: z.string().min(1).max(120),
  grade: z.string().optional(),
  studentIds: z.array(z.string()).default([]),
});
const patchSchema = createSchema.partial();

classesRoute.get('/', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const rows = await db
    .select()
    .from(schema.classes)
    .where(eq(schema.classes.organizationId, orgId))
    .orderBy(desc(schema.classes.createdAt))
    .limit(200);
  return c.json({ classes: rows });
});

classesRoute.post('/', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const body = await c.req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);

  const id = `cls_${ulid()}`;
  const inserted = await db
    .insert(schema.classes)
    .values({
      id,
      organizationId: orgId,
      name: parsed.data.name,
      grade: parsed.data.grade ?? null,
      studentIds: parsed.data.studentIds as unknown as object,
    })
    .returning();
  return c.json({ class: inserted[0] }, 201);
});

classesRoute.patch('/:id', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad_request' }, 400);

  const updated = await db
    .update(schema.classes)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.grade !== undefined ? { grade: parsed.data.grade ?? null } : {}),
      ...(parsed.data.studentIds !== undefined
        ? { studentIds: parsed.data.studentIds as unknown as object }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.classes.id, id), eq(schema.classes.organizationId, orgId)))
    .returning();
  if (updated.length === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ class: updated[0] });
});

classesRoute.delete('/:id', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const id = c.req.param('id');
  const result = await db
    .delete(schema.classes)
    .where(and(eq(schema.classes.id, id), eq(schema.classes.organizationId, orgId)))
    .returning();
  if (result.length === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});
