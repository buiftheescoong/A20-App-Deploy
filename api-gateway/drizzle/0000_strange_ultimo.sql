CREATE TYPE "public"."plan_status" AS ENUM('pending', 'generating', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."resource_category" AS ENUM('sgk', 'sgv', 'khung_chuong_trinh', 'khac');--> statement-breakpoint
CREATE TABLE "lesson_plan_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"message_type" text DEFAULT 'chat',
	"attached_files" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lesson_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"grade" text NOT NULL,
	"topic" text NOT NULL,
	"teaching_model" text NOT NULL,
	"objectives" text[],
	"emphasis" text,
	"special_requests" text,
	"resource_ids" uuid[],
	"content_markdown" text,
	"content_json" jsonb,
	"session_state" jsonb DEFAULT '{}'::jsonb,
	"status" "plan_status" DEFAULT 'pending',
	"iteration_count" integer DEFAULT 0,
	"compliance_status" text,
	"docx_url" text,
	"is_blank_template" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "resource_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_text" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"filename" text NOT NULL,
	"file_url" text NOT NULL,
	"file_size" integer,
	"page_count" integer,
	"content_text" text,
	"is_embedded" boolean DEFAULT false,
	"is_system" boolean DEFAULT false,
	"category" "resource_category",
	"subject" text,
	"grade" text,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "lesson_plan_messages" ADD CONSTRAINT "lesson_plan_messages_plan_id_lesson_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."lesson_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_embeddings" ADD CONSTRAINT "resource_embeddings_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;