import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const workflowStatus = pgEnum("workflow_status", [
  "draft",
  "published",
  "archived"
]);

export const credentialType = pgEnum("credential_type", ["api_key", "bearer_token"]);

export const workflowVersionStatus = pgEnum("workflow_version_status", [
  "draft",
  "published",
  "retired"
]);

export const executionStatus = pgEnum("execution_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled"
]);

export const stepRunStatus = pgEnum("step_run_status", [
  "pending",
  "queued",
  "running",
  "succeeded",
  "retrying",
  "failed",
  "skipped",
  "cancelled"
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const credentials = pgTable(
  "credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    type: credentialType("type").notNull(),
    headerName: text("header_name"),
    encryptedSecret: text("encrypted_secret").notNull(),
    encryptionIv: text("encryption_iv").notNull(),
    encryptionAuthTag: text("encryption_auth_tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true })
  },
  (table) => ({
    ownerArchivedUpdatedAtIdx: index("credentials_owner_archived_updated_at_idx").on(
      table.ownerId,
      table.archivedAt,
      table.updatedAt
    )
  })
);

export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    description: text("description"),
    status: workflowStatus("status").notNull().default("draft"),
    activeVersionId: uuid("active_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true })
  },
  (table) => ({
    ownerStatusCreatedAtIdx: index("workflows_owner_status_created_at_idx").on(
      table.ownerId,
      table.status,
      table.createdAt
    )
  })
);

export const workflowVersions = pgTable(
  "workflow_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id),
    versionNo: integer("version_no").notNull(),
    status: workflowVersionStatus("status").notNull().default("draft"),
    inputSchemaJson: jsonb("input_schema_json").notNull(),
    definitionJson: jsonb("definition_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true })
  },
  (table) => ({
    workflowVersionNoUnique: uniqueIndex("workflow_versions_workflow_id_version_no_unique").on(
      table.workflowId,
      table.versionNo
    )
  })
);

export const executions = pgTable(
  "executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowVersionId: uuid("workflow_version_id")
      .notNull()
      .references(() => workflowVersions.id),
    status: executionStatus("status").notNull().default("queued"),
    triggerType: text("trigger_type").notNull().default("manual"),
    inputJson: jsonb("input_json").notNull(),
    outputJson: jsonb("output_json"),
    errorJson: jsonb("error_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true })
  },
  (table) => ({
    statusCreatedAtIdx: index("executions_status_created_at_idx").on(
      table.status,
      table.createdAt
    )
  })
);

export const stepRuns = pgTable(
  "step_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id),
    stepKey: text("step_key").notNull(),
    status: stepRunStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    inputJson: jsonb("input_json"),
    outputJson: jsonb("output_json"),
    errorJson: jsonb("error_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true })
  },
  (table) => ({
    executionStepKeyUnique: uniqueIndex("step_runs_execution_id_step_key_unique").on(
      table.executionId,
      table.stepKey
    ),
    executionStatusIdx: index("step_runs_execution_status_idx").on(
      table.executionId,
      table.status
    )
  })
);

export const executionEvents = pgTable(
  "execution_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id),
    sequenceNo: integer("sequence_no").notNull(),
    type: text("type").notNull(),
    payloadJson: jsonb("payload_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    executionSequenceUnique: uniqueIndex("execution_events_execution_id_sequence_no_unique").on(
      table.executionId,
      table.sequenceNo
    ),
    executionCreatedAtIdx: index("execution_events_execution_created_at_idx").on(
      table.executionId,
      table.createdAt
    )
  })
);
