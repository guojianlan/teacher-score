import { Hono } from 'hono';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@teacher-score/db';
import * as schema from '@teacher-score/db/schema';

// Per checklist §九.7: learning analytics — knowledge-point heatmap + progress curve
// per student. All queries org-scoped.

export const analyticsRoute = new Hono();

// Progress curve: scores over time for one student.
analyticsRoute.get('/students/:id/progress', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const studentId = c.req.param('id');

  const rows = await db
    .select({
      id: schema.gradingRecords.id,
      subject: schema.gradingRecords.subject,
      totalScore: schema.gradingRecords.totalScore,
      maxScore: schema.gradingRecords.maxScore,
      completedAt: schema.gradingRecords.completedAt,
    })
    .from(schema.gradingRecords)
    .where(
      and(
        eq(schema.gradingRecords.organizationId, orgId),
        eq(schema.gradingRecords.studentId, studentId),
        eq(schema.gradingRecords.status, 'completed'),
      ),
    )
    .orderBy(schema.gradingRecords.completedAt);

  return c.json({
    points: rows.map((r) => ({
      gradingId: r.id,
      subject: r.subject,
      score: r.totalScore,
      maxScore: r.maxScore,
      pct: r.maxScore ? Math.round((Number(r.totalScore ?? 0) / r.maxScore) * 100) : 0,
      at: r.completedAt?.toISOString() ?? null,
    })),
  });
});

// Knowledge-point heatmap: occurrences per tag, optionally per student/subject.
analyticsRoute.get('/heatmap', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const search = new URL(c.req.url).searchParams;
  const studentId = search.get('studentId');
  const subject = search.get('subject');

  const where = [eq(schema.mistakeCollection.organizationId, orgId)];
  if (studentId) where.push(eq(schema.mistakeCollection.studentId, studentId));
  if (subject) where.push(eq(schema.mistakeCollection.subject, subject));

  const rows = await db
    .select({
      tags: schema.mistakeCollection.knowledgeTags,
      occurrences: schema.mistakeCollection.occurrences,
    })
    .from(schema.mistakeCollection)
    .where(and(...where));

  const tagCounts = new Map<string, number>();
  for (const r of rows) {
    for (const t of r.tags ?? []) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + r.occurrences);
    }
  }
  const heatmap = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  return c.json({ heatmap });
});

// Subject summary: counts per subject for the org (or a given student).
analyticsRoute.get('/summary', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const search = new URL(c.req.url).searchParams;
  const studentId = search.get('studentId');

  const where = [
    eq(schema.gradingRecords.organizationId, orgId),
    eq(schema.gradingRecords.status, 'completed'),
  ];
  if (studentId) where.push(eq(schema.gradingRecords.studentId, studentId));

  const rows = await db
    .select({
      subject: schema.gradingRecords.subject,
      count: sql<number>`count(*)::int`,
      avgPct: sql<number>`coalesce(avg((total_score::float / nullif(max_score, 0)) * 100), 0)::float`,
    })
    .from(schema.gradingRecords)
    .where(and(...where))
    .groupBy(schema.gradingRecords.subject);

  return c.json({ summary: rows });
});
