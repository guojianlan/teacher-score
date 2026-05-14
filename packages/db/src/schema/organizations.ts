import { pgTable, text, timestamp, boolean, integer, index } from 'drizzle-orm/pg-core';
import { users } from './auth';

// Per checklist §四.6: subscriptionTier/monthlyQuota/isPersonal MUST be top-level columns,
// not JSONB metadata. See §十三 (forbidden patterns).

export const subscriptionTierValues = ['free', 'basic', 'pro', 'plus'] as const;
export type SubscriptionTier = (typeof subscriptionTierValues)[number];

export const organizations = pgTable(
  'organizations',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    logo: text('logo'),
    isPersonal: boolean('is_personal').notNull().default(false),
    subscriptionTier: text('subscription_tier', { enum: subscriptionTierValues })
      .notNull()
      .default('free'),
    monthlyQuota: integer('monthly_quota').notNull().default(50),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: index('organizations_slug_idx').on(t.slug),
  }),
);

export const organizationRoles = ['owner', 'admin', 'member'] as const;
export type OrganizationRole = (typeof organizationRoles)[number];

export const members = pgTable(
  'organization_members',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: organizationRoles }).notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('organization_members_org_idx').on(t.organizationId),
    userIdx: index('organization_members_user_idx').on(t.userId),
  }),
);

export const invitations = pgTable(
  'organization_invitations',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role', { enum: organizationRoles }).notNull().default('member'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected', 'expired'] })
      .notNull()
      .default('pending'),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('organization_invitations_org_idx').on(t.organizationId),
    emailIdx: index('organization_invitations_email_idx').on(t.email),
  }),
);
