CREATE TABLE "daily_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" varchar(200) NOT NULL,
	"experiment_id" uuid NOT NULL,
	"observed_date" date NOT NULL,
	"habit_status" varchar(20),
	"note" varchar(500) DEFAULT '' NOT NULL,
	"recorded_at" timestamp(6) with time zone,
	"updated_at" timestamp(6) with time zone,
	"origin" varchar(20) NOT NULL,
	CONSTRAINT "daily_entry_experiment_date" UNIQUE("experiment_id","observed_date"),
	CONSTRAINT "entry_experiment_public_id" UNIQUE("experiment_id","public_id"),
	CONSTRAINT "entry_id_experiment" UNIQUE("id","experiment_id"),
	CONSTRAINT "entry_status" CHECK (("daily_entries"."habit_status" is not null and "daily_entries"."habit_status" in ('done', 'not_done')) or ("daily_entries"."habit_status" is null and "daily_entries"."origin" = 'legacy_ab')),
	CONSTRAINT "entry_origin" CHECK ("daily_entries"."origin" in ('check_in', 'legacy_ab'))
);
--> statement-breakpoint
CREATE TABLE "daily_entry_values" (
	"entry_id" uuid NOT NULL,
	"metric_id" uuid NOT NULL,
	"experiment_id" uuid NOT NULL,
	"numeric_value" double precision NOT NULL,
	CONSTRAINT "daily_entry_values_entry_id_metric_id_pk" PRIMARY KEY("entry_id","metric_id"),
	CONSTRAINT "entry_value_score" CHECK ("daily_entry_values"."numeric_value" between 1 and 10 and "daily_entry_values"."numeric_value" = floor("daily_entry_values"."numeric_value"))
);
--> statement-breakpoint
CREATE TABLE "experiment_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"metric_id" varchar(200) NOT NULL,
	"label" varchar(40),
	"kind" varchar(20) NOT NULL,
	"scale_kind" varchar(20) NOT NULL,
	"scale_min" integer NOT NULL,
	"scale_max" integer NOT NULL,
	"scale_step" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "metric_experiment_stable_id" UNIQUE("experiment_id","metric_id"),
	CONSTRAINT "metric_experiment_position" UNIQUE("experiment_id","position"),
	CONSTRAINT "metric_id_experiment" UNIQUE("id","experiment_id"),
	CONSTRAINT "metric_kind" CHECK ("experiment_metrics"."kind" in ('built_in', 'custom')),
	CONSTRAINT "metric_label" CHECK (("experiment_metrics"."kind" = 'custom' and "experiment_metrics"."label" is not null and length(trim("experiment_metrics"."label")) > 0) or ("experiment_metrics"."kind" = 'built_in' and "experiment_metrics"."label" is null)),
	CONSTRAINT "metric_numeric_scale" CHECK ("experiment_metrics"."scale_kind" = 'numeric' and "experiment_metrics"."scale_min" = 1 and "experiment_metrics"."scale_max" = 10 and "experiment_metrics"."scale_step" = 1),
	CONSTRAINT "metric_position" CHECK ("experiment_metrics"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" varchar(200) NOT NULL,
	"workspace_id" uuid NOT NULL,
	"mode" varchar(30) DEFAULT 'daily_habit' NOT NULL,
	"title" varchar(120) NOT NULL,
	"question" varchar(600) NOT NULL,
	"habit" varchar(500) NOT NULL,
	"status" varchar(20) NOT NULL,
	"start_date" date NOT NULL,
	"target_duration_days" integer NOT NULL,
	"completed_at" timestamp(6) with time zone,
	"source" varchar(20) DEFAULT 'user' NOT NULL,
	"legacy_archive" jsonb,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiment_workspace_public_id" UNIQUE("workspace_id","public_id"),
	CONSTRAINT "experiment_mode" CHECK ("experiments"."mode" = 'daily_habit'),
	CONSTRAINT "experiment_source" CHECK ("experiments"."source" = 'user'),
	CONSTRAINT "experiment_status" CHECK ("experiments"."status" in ('active', 'completed')),
	CONSTRAINT "experiment_completion" CHECK ("experiments"."status" = 'completed' or "experiments"."completed_at" is null),
	CONSTRAINT "experiment_target" CHECK ("experiments"."target_duration_days" between 1 and 365)
);
--> statement-breakpoint
CREATE TABLE "local_imports" (
	"workspace_id" uuid NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"imported_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_imports_workspace_id_fingerprint_pk" PRIMARY KEY("workspace_id","fingerprint")
);
--> statement-breakpoint
CREATE TABLE "experiment_target_extensions" (
	"experiment_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"previous_duration_days" integer NOT NULL,
	"duration_days" integer NOT NULL,
	"extended_at" timestamp(6) with time zone NOT NULL,
	"request_id" uuid,
	"requested_days" integer,
	CONSTRAINT "experiment_target_extensions_experiment_id_position_pk" PRIMARY KEY("experiment_id","position"),
	CONSTRAINT "extension_request_id" UNIQUE("experiment_id","request_id"),
	CONSTRAINT "extension_durations" CHECK ("experiment_target_extensions"."previous_duration_days" >= 1 and "experiment_target_extensions"."duration_days" > "experiment_target_extensions"."previous_duration_days" and "experiment_target_extensions"."duration_days" <= 365),
	CONSTRAINT "extension_position" CHECK ("experiment_target_extensions"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_entries" ADD CONSTRAINT "daily_entries_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_entry_values" ADD CONSTRAINT "daily_entry_values_entry_id_experiment_id_daily_entries_id_experiment_id_fk" FOREIGN KEY ("entry_id","experiment_id") REFERENCES "public"."daily_entries"("id","experiment_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_entry_values" ADD CONSTRAINT "daily_entry_values_metric_id_experiment_id_experiment_metrics_id_experiment_id_fk" FOREIGN KEY ("metric_id","experiment_id") REFERENCES "public"."experiment_metrics"("id","experiment_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_metrics" ADD CONSTRAINT "experiment_metrics_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_imports" ADD CONSTRAINT "local_imports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_target_extensions" ADD CONSTRAINT "experiment_target_extensions_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "experiments_workspace_created" ON "experiments" USING btree ("workspace_id","created_at");