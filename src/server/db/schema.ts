import { sql } from "drizzle-orm";
import { authUsers } from "./auth-schema";
export * from "./auth-schema";
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  date,
  doublePrecision,
  jsonb,
  primaryKey,
  unique,
  check,
  foreignKey,
  index,
  text,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { LegacyExperiment } from "@/features/experiments/model/types";
const instant = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string", precision: 6 });
export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    ownerUserId: text("owner_user_id").references(() => authUsers.id, { onDelete: "restrict" }),
    isPersonal: boolean("is_personal").notNull().default(false),
    createdAt: instant("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("workspace_personal_owner")
      .on(table.ownerUserId)
      .where(sql`${table.isPersonal} = true`),
    index("workspace_owner").on(table.ownerUserId),
    check(
      "workspace_personal_requires_owner",
      sql`not ${table.isPersonal} or ${table.ownerUserId} is not null`,
    ),
  ],
);
export const experiments = pgTable(
  "experiments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    publicId: varchar("public_id", { length: 200 }).notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    mode: varchar("mode", { length: 30 }).notNull().default("daily_habit"),
    title: varchar("title", { length: 120 }).notNull(),
    question: varchar("question", { length: 600 }).notNull(),
    habit: varchar("habit", { length: 500 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    durationDays: integer("target_duration_days").notNull(),
    completedAt: instant("completed_at"),
    source: varchar("source", { length: 20 }).notNull().default("user"),
    legacy: jsonb("legacy_archive").$type<LegacyExperiment>(),
    createdAt: instant("created_at").defaultNow().notNull(),
    updatedAt: instant("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("experiment_workspace_public_id").on(table.workspaceId, table.publicId),
    index("experiments_workspace_created").on(table.workspaceId, table.createdAt),
    check("experiment_mode", sql`${table.mode} = 'daily_habit'`),
    check("experiment_source", sql`${table.source} = 'user'`),
    check("experiment_status", sql`${table.status} in ('active', 'completed')`),
    check(
      "experiment_completion",
      sql`${table.status} = 'completed' or ${table.completedAt} is null`,
    ),
    check("experiment_target", sql`${table.durationDays} between 1 and 365`),
  ],
);
export const experimentMetrics = pgTable(
  "experiment_metrics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    experimentId: uuid("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    metricId: varchar("metric_id", { length: 200 }).notNull(),
    label: varchar("label", { length: 40 }),
    kind: varchar("kind", { length: 20 }).notNull(),
    scaleKind: varchar("scale_kind", { length: 20 }).notNull(),
    scaleMin: integer("scale_min").notNull(),
    scaleMax: integer("scale_max").notNull(),
    scaleStep: integer("scale_step").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    unique("metric_experiment_stable_id").on(table.experimentId, table.metricId),
    unique("metric_experiment_position").on(table.experimentId, table.position),
    unique("metric_id_experiment").on(table.id, table.experimentId),
    check("metric_kind", sql`${table.kind} in ('built_in', 'custom')`),
    check(
      "metric_label",
      sql`(${table.kind} = 'custom' and ${table.label} is not null and length(trim(${table.label})) > 0) or (${table.kind} = 'built_in' and ${table.label} is null)`,
    ),
    check(
      "metric_numeric_scale",
      sql`${table.scaleKind} = 'numeric' and ${table.scaleMin} = 1 and ${table.scaleMax} = 10 and ${table.scaleStep} = 1`,
    ),
    check("metric_position", sql`${table.position} >= 0`),
  ],
);
export const dailyEntries = pgTable(
  "daily_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    publicId: varchar("public_id", { length: 200 }).notNull(),
    experimentId: uuid("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    observedDate: date("observed_date", { mode: "string" }).notNull(),
    habitStatus: varchar("habit_status", { length: 20 }),
    note: varchar("note", { length: 500 }).notNull().default(""),
    recordedAt: instant("recorded_at"),
    updatedAt: instant("updated_at"),
    origin: varchar("origin", { length: 20 }).notNull(),
  },
  (table) => [
    unique("daily_entry_experiment_date").on(table.experimentId, table.observedDate),
    unique("entry_experiment_public_id").on(table.experimentId, table.publicId),
    unique("entry_id_experiment").on(table.id, table.experimentId),
    check(
      "entry_status",
      sql`(${table.habitStatus} is not null and ${table.habitStatus} in ('done', 'not_done')) or (${table.habitStatus} is null and ${table.origin} = 'legacy_ab')`,
    ),
    check("entry_origin", sql`${table.origin} in ('check_in', 'legacy_ab')`),
  ],
);
export const dailyEntryValues = pgTable(
  "daily_entry_values",
  {
    entryId: uuid("entry_id").notNull(),
    metricId: uuid("metric_id").notNull(),
    experimentId: uuid("experiment_id").notNull(),
    value: doublePrecision("numeric_value").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.entryId, table.metricId] }),
    foreignKey({
      columns: [table.entryId, table.experimentId],
      foreignColumns: [dailyEntries.id, dailyEntries.experimentId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.metricId, table.experimentId],
      foreignColumns: [experimentMetrics.id, experimentMetrics.experimentId],
    }).onDelete("cascade"),
    check(
      "entry_value_score",
      sql`${table.value} between 1 and 10 and ${table.value} = floor(${table.value})`,
    ),
  ],
);
export const targetExtensions = pgTable(
  "experiment_target_extensions",
  {
    experimentId: uuid("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    previousDurationDays: integer("previous_duration_days").notNull(),
    durationDays: integer("duration_days").notNull(),
    extendedAt: instant("extended_at").notNull(),
    requestId: uuid("request_id"),
    requestedDays: integer("requested_days"),
  },
  (table) => [
    primaryKey({ columns: [table.experimentId, table.position] }),
    unique("extension_request_id").on(table.experimentId, table.requestId),
    check(
      "extension_durations",
      sql`${table.previousDurationDays} >= 1 and ${table.durationDays} > ${table.previousDurationDays} and ${table.durationDays} <= 365`,
    ),
    check("extension_position", sql`${table.position} >= 0`),
  ],
);

export const localImports = pgTable(
  "local_imports",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    importedAt: instant("imported_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.fingerprint] })],
);
