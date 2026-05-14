import { createLogger } from '@teacher-score/logger';

const log = createLogger({ scope: 'analytics' });

// Seed analytics events per checklist §七.6. Names are stable across server/client.
export type AnalyticsEvent =
  | 'user_signed_up'
  | 'student_created'
  | 'grading_started'
  | 'grading_completed'
  | 'grading_score_modified'
  | 'quota_exceeded'
  | 'template_created'
  | 'mistake_mastered';

interface CaptureInput {
  distinctId: string; // userId
  event: AnalyticsEvent;
  properties?: Record<string, unknown>;
  organizationId?: string;
}

// Silent-when-unconfigured: if POSTHOG_API_KEY is unset, log at debug and bail.
// Per checklist red lines: don't log studentName or other sensitive identifiers.

const API_KEY = process.env.POSTHOG_API_KEY;
const HOST = process.env.POSTHOG_HOST ?? 'https://app.posthog.com';

const FORBIDDEN_KEYS = new Set([
  'password',
  'token',
  'apiKey',
  'studentName',
  'student_name',
  'email',
]);

function sanitize(props?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!props) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

export async function capture(input: CaptureInput): Promise<void> {
  if (!API_KEY) {
    log.debug({ event: input.event }, '[analytics] disabled (no POSTHOG_API_KEY)');
    return;
  }
  try {
    await fetch(`${HOST}/capture/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: API_KEY,
        event: input.event,
        distinct_id: input.distinctId,
        properties: {
          organizationId: input.organizationId,
          ...sanitize(input.properties),
        },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err) {
    log.warn({ err }, '[analytics] capture failed (non-blocking)');
  }
}
