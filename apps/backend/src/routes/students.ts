import { Hono } from 'hono';
import { z } from 'zod';
import { ulid } from 'ulid';
import { and, eq, ilike, sql } from 'drizzle-orm';
import { db } from '@teacher-score/db';
import * as schema from '@teacher-score/db/schema';
import { SUBJECTS } from '@teacher-score/types';
import { capture } from '@teacher-score/analytics';

export const studentsRoute = new Hono();

const createSchema = z.object({
  name: z.string().min(1).max(100),
  grade: z.string().max(50).optional(),
  subjects: z.array(z.enum(SUBJECTS)).default([]),
  notes: z.string().max(5000).optional(),
});

const patchSchema = createSchema.partial();

const listQuerySchema = z.object({
  search: z.string().optional(),
  grade: z.string().optional(),
  subject: z.enum(SUBJECTS).optional(),
  includeArchived: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

studentsRoute.get('/', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);

  const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);
  const q = parsed.data;

  const where = [eq(schema.students.organizationId, orgId)];
  if (!q.includeArchived) where.push(eq(schema.students.archived, false));
  if (q.search) where.push(ilike(schema.students.name, `%${q.search}%`));
  if (q.grade) where.push(eq(schema.students.grade, q.grade));
  if (q.subject) {
    // subjects is text[]; filter rows where subjects contains the subject literal
    where.push(sql`${schema.students.subjects} @> ARRAY[${q.subject}]::text[]`);
  }

  const rows = await db
    .select()
    .from(schema.students)
    .where(and(...where))
    .orderBy(schema.students.createdAt);

  return c.json({ students: rows });
});

studentsRoute.post('/', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);

  const body = await c.req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);

  const id = `stu_${ulid()}`;
  const inserted = await db
    .insert(schema.students)
    .values({
      id,
      organizationId: orgId,
      name: parsed.data.name,
      grade: parsed.data.grade ?? null,
      subjects: parsed.data.subjects,
      notes: parsed.data.notes ?? null,
    })
    .returning();

  const session = c.get('session');
  if (session) {
    capture({
      distinctId: session.userId,
      organizationId: orgId,
      event: 'student_created',
      properties: { studentId: id, grade: parsed.data.grade ?? null, subjects: parsed.data.subjects },
    }).catch(() => undefined);
  }

  return c.json({ student: inserted[0] }, 201);
});

studentsRoute.patch('/:id', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);

  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);

  const updated = await db
    .update(schema.students)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(schema.students.organizationId, orgId), eq(schema.students.id, id)))
    .returning();

  if (updated.length === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ student: updated[0] });
});

// CSV bulk import (§十.5).
//   Accepts: text/csv body
//   Header row: name,grade,subjects,notes
//   subjects: comma-or-pipe separated, validated against SUBJECTS
studentsRoute.post('/bulk', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const body = await c.req.text();
  if (!body.trim()) return c.json({ error: 'empty_csv' }, 400);

  const lines = body.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return c.json({ error: 'no_rows' }, 400);

  const headers = lines[0]!.split(',').map((s) => s.trim().toLowerCase());
  const idx = {
    name: headers.indexOf('name'),
    grade: headers.indexOf('grade'),
    subjects: headers.indexOf('subjects'),
    notes: headers.indexOf('notes'),
  };
  if (idx.name === -1) return c.json({ error: 'missing_name_column' }, 400);

  const created: string[] = [];
  const errors: Array<{ row: number; reason: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]!);
    const name = cols[idx.name]?.trim();
    if (!name) {
      errors.push({ row: i + 1, reason: 'empty name' });
      continue;
    }
    const subsRaw =
      idx.subjects >= 0 ? (cols[idx.subjects] ?? '').replace(/\s/g, '').split(/[|,;]/).filter(Boolean) : [];
    const subjects = subsRaw.filter((s): s is (typeof SUBJECTS)[number] =>
      (SUBJECTS as readonly string[]).includes(s),
    );
    const id = `stu_${ulid()}`;
    try {
      await db.insert(schema.students).values({
        id,
        organizationId: orgId,
        name,
        grade: idx.grade >= 0 ? cols[idx.grade]?.trim() || null : null,
        subjects,
        notes:
          idx.notes >= 0 ? (cols[idx.notes] ?? '').slice(0, 5000) || null : null,
      });
      created.push(id);
    } catch (e) {
      errors.push({ row: i + 1, reason: (e as Error).message });
    }
  }

  return c.json({ created: created.length, errors });
});

function parseCsvRow(row: string): string[] {
  // Minimal CSV parser — supports quoted fields with commas inside.
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuote) {
      if (ch === '"' && row[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuote = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') {
        out.push(cur);
        cur = '';
      } else if (ch === '"' && cur === '') {
        inQuote = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

studentsRoute.delete('/:id', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);

  const id = c.req.param('id');
  // Soft delete
  const updated = await db
    .update(schema.students)
    .set({ archived: true, archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.students.organizationId, orgId), eq(schema.students.id, id)))
    .returning();

  if (updated.length === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ student: updated[0] });
});
