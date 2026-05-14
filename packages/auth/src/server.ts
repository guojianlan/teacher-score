import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { db } from '@teacher-score/db';
import * as schema from '@teacher-score/db/schema';
import { createLogger } from '@teacher-score/logger';
import { sendPasswordResetEmail, sendVerificationEmail } from '@teacher-score/email';
import { ensurePersonalOrganization } from './personal-org';

const log = createLogger({ scope: 'auth' });

const secret = process.env.BETTER_AUTH_SECRET;
const baseUrl = process.env.BETTER_AUTH_URL ?? process.env.APP_URL ?? 'http://localhost:3000';

if (!secret && process.env.NODE_ENV === 'production') {
  throw new Error('BETTER_AUTH_SECRET is required in production');
}

export const auth = betterAuth({
  secret: secret ?? 'dev-only-not-secret-please-replace',
  baseURL: baseUrl,
  basePath: '/api/auth',
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
      organization: schema.organizations,
      member: schema.members,
      invitation: schema.invitations,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({ to: user.email, url });
    },
  },
  // Stage 4 §十.1: Google OAuth — enabled when GOOGLE_CLIENT_ID/SECRET are configured.
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        socialProviders: {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        },
      }
    : {}),
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail({ to: user.email, url });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh once a day
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      organizationLimit: 10,
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Auto-create a personal organization on first signup.
          try {
            await ensurePersonalOrganization({ userId: user.id, userName: user.name });
          } catch (err) {
            log.error({ err, userId: user.id }, 'failed to create personal organization');
            throw err;
          }
        },
      },
    },
  },
});

export type Auth = typeof auth;
