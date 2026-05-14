CREATE TABLE IF NOT EXISTS "account" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_id_pk" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"active_organization_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"inviter_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_members" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"is_personal" boolean DEFAULT false NOT NULL,
	"subscription_tier" text DEFAULT 'free' NOT NULL,
	"monthly_quota" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "students" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"grade" text,
	"subjects" text[] DEFAULT '{}' NOT NULL,
	"notes" varchar(5000),
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_papers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"grade" text,
	"total_score" integer DEFAULT 100 NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grading_records" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"student_id" text NOT NULL,
	"exam_paper_id" text,
	"subject" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress" text,
	"image_keys" text[] DEFAULT '{}' NOT NULL,
	"results" jsonb,
	"total_score" integer,
	"max_score" integer,
	"overall_comment" text,
	"llm_raw_output" jsonb,
	"teacher_modified" boolean DEFAULT false NOT NULL,
	"tokens_used" integer,
	"cost_cents" integer,
	"duration_ms" integer,
	"model" text,
	"error_code" text,
	"error_message" text,
	"retryable" boolean,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mistake_collection" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"student_id" text NOT NULL,
	"subject" text NOT NULL,
	"question_hash" text NOT NULL,
	"question_stem" text NOT NULL,
	"correct_answer" text,
	"knowledge_tags" text[] DEFAULT '{}' NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"last_wrong_answer" text,
	"last_grading_id" text,
	"mastered" boolean DEFAULT false NOT NULL,
	"mastered_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mistake_collection_unique" UNIQUE("organization_id","student_id","question_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monthly_quotas" (
	"organization_id" text NOT NULL,
	"year_month" text NOT NULL,
	"gradings_used" integer DEFAULT 0 NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_quotas_organization_id_year_month_pk" PRIMARY KEY("organization_id","year_month")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "students" ADD CONSTRAINT "students_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grading_records" ADD CONSTRAINT "grading_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grading_records" ADD CONSTRAINT "grading_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grading_records" ADD CONSTRAINT "grading_records_exam_paper_id_exam_papers_id_fk" FOREIGN KEY ("exam_paper_id") REFERENCES "public"."exam_papers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mistake_collection" ADD CONSTRAINT "mistake_collection_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mistake_collection" ADD CONSTRAINT "mistake_collection_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mistake_collection" ADD CONSTRAINT "mistake_collection_last_grading_id_grading_records_id_fk" FOREIGN KEY ("last_grading_id") REFERENCES "public"."grading_records"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monthly_quotas" ADD CONSTRAINT "monthly_quotas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_invitations_org_idx" ON "organization_invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_invitations_email_idx" ON "organization_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_members_org_idx" ON "organization_members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_members_user_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_slug_idx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "students_org_idx" ON "students" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "students_org_archived_idx" ON "students" USING btree ("organization_id","archived");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "students_org_grade_idx" ON "students" USING btree ("organization_id","grade");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_papers_org_idx" ON "exam_papers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_papers_org_subject_idx" ON "exam_papers" USING btree ("organization_id","subject");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grading_records_org_idx" ON "grading_records" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grading_records_org_status_idx" ON "grading_records" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grading_records_org_student_idx" ON "grading_records" USING btree ("organization_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grading_records_org_created_idx" ON "grading_records" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mistake_collection_org_idx" ON "mistake_collection" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mistake_collection_org_student_idx" ON "mistake_collection" USING btree ("organization_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mistake_collection_org_subject_idx" ON "mistake_collection" USING btree ("organization_id","subject");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monthly_quotas_org_idx" ON "monthly_quotas" USING btree ("organization_id");