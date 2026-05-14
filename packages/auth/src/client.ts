import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';

// All browser requests go to same-origin /api/auth/* (proxied to backend by Next rewrite).
// Per checklist red lines: never include the backend internal URL in browser code.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const authClient: any = createAuthClient({
  baseURL:
    typeof window === 'undefined'
      ? (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
      : window.location.origin,
  plugins: [organizationClient()],
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
