// Browser-side PostHog wrapper. Silent when key not configured.
// Use NEXT_PUBLIC_POSTHOG_KEY in the web app.

type AnyProps = Record<string, unknown>;

let initialized = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let posthog: any = null;

export async function initClientAnalytics(): Promise<void> {
  if (initialized || typeof window === 'undefined') return;
  const key =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) || '';
  if (!key) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    posthog = (await import('posthog-js' as any).catch(() => null))?.default ?? null;
    if (!posthog) return;
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com',
      capture_pageview: true,
      autocapture: false,
      persistence: 'localStorage',
    });
    initialized = true;
  } catch {
    // never block UI on analytics
  }
}

export function captureClient(event: string, props?: AnyProps): void {
  if (!posthog) return;
  posthog.capture(event, props);
}

export function identifyClient(distinctId: string, props?: AnyProps): void {
  if (!posthog) return;
  posthog.identify(distinctId, props);
}
