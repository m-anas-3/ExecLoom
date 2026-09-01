CREATE TABLE "execution_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_id" uuid NOT NULL,
	"step_run_id" uuid NOT NULL,
	"attempt_no" integer NOT NULL,
	"job_id" text NOT NULL,
	"job_name" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatch_attempt_count" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"dispatched_at" timestamp with time zone,
	"discarded_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "execution_outbox" ADD CONSTRAINT "execution_outbox_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_outbox" ADD CONSTRAINT "execution_outbox_step_run_id_step_runs_id_fk" FOREIGN KEY ("step_run_id") REFERENCES "public"."step_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "execution_outbox_job_id_unique" ON "execution_outbox" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "execution_outbox_step_run_attempt_unique" ON "execution_outbox" USING btree ("step_run_id","attempt_no");--> statement-breakpoint
CREATE INDEX "execution_outbox_dispatch_due_idx" ON "execution_outbox" USING btree ("dispatched_at","discarded_at","available_at");--> statement-breakpoint
CREATE INDEX "execution_outbox_execution_created_at_idx" ON "execution_outbox" USING btree ("execution_id","created_at");