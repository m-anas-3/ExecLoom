# ADR-003: Immutable Workflow Version Definitions

## Status

Accepted

## Context

Workflow executions must remain reproducible after a workflow definition changes. Updating a definition in place would make historical executions appear to reference steps they never ran.

## Decision

ExecLoom stores each definition change as a new `workflow_versions` row. Version content is immutable after creation.

- A workflow may have one current draft. Creating another draft retires the previous draft.
- Publishing a draft retires the previously active version and moves the workflow's `active_version_id` to the new version.
- Existing executions keep their original `workflow_version_id`.
- Version creation and publishing lock the workflow row inside a database transaction so concurrent requests cannot allocate the same version number or race the active-version update.

## Alternatives Considered

### Update the active definition in place

This uses fewer rows, but it breaks auditability and makes historical executions difficult to debug.

### Copy the full definition into every execution

This preserves history but duplicates large definitions and separates executions from a clear version lifecycle.

## Consequences

Definitions use additional storage and lifecycle operations require transactions. In return, every execution has a stable definition, publishing is explicit, and rollback can later be implemented by creating or reactivating a known version through a controlled operation.

## Interview Answer

I used immutable workflow versions so an execution always points to the exact definition it ran. Editing creates a new row instead of changing history. Publishing atomically switches the active version, while older executions continue to reference their original version for reliable debugging and auditing.
