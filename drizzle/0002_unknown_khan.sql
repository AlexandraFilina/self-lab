CREATE TABLE "daily_reflection_values" (
	"reflection_id" uuid NOT NULL,
	"metric_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"numeric_value" double precision NOT NULL,
	CONSTRAINT "daily_reflection_values_reflection_id_metric_id_pk" PRIMARY KEY("reflection_id","metric_id"),
	CONSTRAINT "daily_reflection_value_score" CHECK ("daily_reflection_values"."numeric_value" between 1 and 10 and "daily_reflection_values"."numeric_value" = floor("daily_reflection_values"."numeric_value"))
);
--> statement-breakpoint
CREATE TABLE "daily_reflections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"observed_date" date NOT NULL,
	"note" varchar(500) DEFAULT '' NOT NULL,
	"recorded_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone,
	CONSTRAINT "daily_reflection_workspace_date" UNIQUE("workspace_id","observed_date"),
	CONSTRAINT "daily_reflection_row_workspace" UNIQUE("id","workspace_id")
);
--> statement-breakpoint
CREATE TABLE "global_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"metric_id" varchar(200) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"label" varchar(40) NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"scale_min" integer DEFAULT 1 NOT NULL,
	"scale_max" integer DEFAULT 10 NOT NULL,
	"scale_step" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "global_metric_workspace_id" UNIQUE("workspace_id","metric_id"),
	CONSTRAINT "global_metric_row_workspace" UNIQUE("id","workspace_id"),
	CONSTRAINT "global_metric_kind" CHECK ("global_metrics"."kind" in ('built_in', 'custom')),
	CONSTRAINT "global_metric_label" CHECK (length(trim("global_metrics"."label")) > 0),
	CONSTRAINT "global_metric_scale" CHECK ("global_metrics"."scale_min" = 1 and "global_metrics"."scale_max" = 10 and "global_metrics"."scale_step" = 1)
);
--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "outcome_source" varchar(20) DEFAULT 'scoped' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_reflection_values" ADD CONSTRAINT "daily_reflection_values_reflection_id_workspace_id_daily_reflections_id_workspace_id_fk" FOREIGN KEY ("reflection_id","workspace_id") REFERENCES "public"."daily_reflections"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_reflection_values" ADD CONSTRAINT "daily_reflection_values_metric_id_workspace_id_global_metrics_id_workspace_id_fk" FOREIGN KEY ("metric_id","workspace_id") REFERENCES "public"."global_metrics"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_reflections" ADD CONSTRAINT "daily_reflections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_metrics" ADD CONSTRAINT "global_metrics_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "global_metric_workspace_label" ON "global_metrics" USING btree ("workspace_id",lower(trim("label")));--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiment_outcome_source" CHECK ("experiments"."outcome_source" in ('scoped', 'global'));