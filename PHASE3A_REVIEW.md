# Phase 3A review

PHASE 3A IMPLEMENTED: YES  
LIVE BUSINESS DATA MUTATED BY TESTS: NO  
COMMITTED: NO  
PUSHED: NO

## Scope and architecture inspected

Implemented Head Office final locking and SUBMIT/FINAL_LOCK milestone auditing only. Inspected the Phase 2 report service, controller, routes, mysql2 pool, authentication/authorization middleware, Phase 1/2 tests, central report component, and migration execution/recovery reviews before implementation. Existing transaction, validation, branch isolation, totals, and business-date conventions remain in place.

The working tree already contained migration recovery changes despite the supplied clean-tree checkpoint. Those changes were preserved: `.gitignore`, `Bank-backend/scripts/phase1-migration.js`, `Bank-backend/scripts/phase1-migration.test.js`, `MIGRATION_EXECUTION_REVIEW.md`, and `MIGRATION_RECOVERY_REVIEW.md`. They are not new Phase 3A work.

## Phase 3A files

- `Bank-backend/services/business-audit.service.js` — new shared transactional milestone insertion helper.
- `Bank-backend/services/business-report.service.js` — final-lock operation and all three submission integrations.
- `Bank-backend/controllers/business.controller.js` — final-lock handler using existing safe error handling.
- `Bank-backend/routes/business.routes.js` — authenticated, HEAD_OFFICE-only route.
- `frontend/src/components/AdminBusinessReports.jsx` — confirmation, final-lock action, feedback, and state reconciliation.
- `Bank-backend/scripts/helpers/report-fixture.js` — shared isolated database fixture and actual route/controller/middleware harness extracted from Phase 2, extended for milestones.
- `Bank-backend/scripts/phase2-reports.test.js` — imports shared fixture; preserves all 45 existing tests.
- `Bank-backend/scripts/phase3a-milestones.test.js` — 46 new focused tests.
- `PHASE3A_REVIEW.md` — this review.

## Endpoint and lifecycle

`POST /api/business/entry/:id/final-lock` requires authentication and HEAD_OFFICE role. MANAGER, EMPLOYEE, and ADMIN receive 403; unauthenticated requests are denied by existing authentication middleware. ADMIN retains central read access only.

Head Office can select a report from any branch. The report ID is validated and branch metadata comes from the locked database row. Request-body actor, branch, and status fields cannot control the operation. Malformed input returns 400, missing reports 404, and invalid lifecycle transitions 409. Database/internal errors retain the existing safe response handling.

Only normalized `SUBMITTED -> FINAL_LOCKED` is accepted, including historical lowercase values. Draft, final-locked, unknown, and null statuses are rejected. Success returns `{ entryId, status: 'FINAL_LOCKED' }`. Repeated attempts return 409 with no additional audit row. No generic status endpoint or bulk normalization was added. Manager editing, deletion, resubmission, and downgrade of final-locked reports remain blocked.

## Transaction and audit implementation

Uses the existing `pool.promise().getConnection()` transaction wrapper: begin, select report `FOR UPDATE`, validate, update status, insert audit, commit. Errors roll back and the connection is released in `finally`; existing rollback-failure handling is preserved. Report state and audit insertion share the same dedicated connection. Final lock changes only status, preserving report totals, items, and submission timestamp.

Read-only inspection confirmed the existing audit columns: integer `id`, `entry_id`, `branch_id`, `actor_id`; `action VARCHAR(50)`, `actor_role VARCHAR(50)`, `actor_name VARCHAR(100)`; nullable JSON `previous_state` and `new_state`; nullable `reason TEXT`, `ip_address VARCHAR(45)`, `user_agent TEXT`; and `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`. The audit entry foreign key is `phase1_audit_entry_fk` with restrictive delete/update behavior. Existing report branch/manager restrictions and unique branch/date constraint remain intact.

The helper writes entry/branch IDs, action, verified actor ID/role, database-resolved actor name, and small JSON status snapshots. The database supplies the timestamp. Optional reason/network metadata remains null. A nullable user name gets a deterministic `User #<id>` fallback; a missing actor aborts the transaction. No passwords, hashes, tokens, complete request bodies, or full report/user records are logged.

Explicit submit, create-and-submit, and update-and-submit call one shared submission milestone operation inside their existing transactions. Each successful transition creates exactly one SUBMIT row. Draft-only saves, rejected requests, repeated submissions, and rolled-back transactions create no persisted milestone. FINAL_LOCK uses the same helper with authenticated Head Office identity and locked report metadata. Audit insertion failure rolls back the state change in every path.

## Frontend

The existing central report detail view offers Final Lock only for HEAD_OFFICE and normalized SUBMITTED status. Confirmation identifies branch and report date. The action is disabled while loading/locking; success immediately displays FINAL_LOCKED, removes the action, shows a safe toast, and refreshes details and summary. A 409 clears the stale actionable status and refreshes server state. Backend authorization remains authoritative. Direct central editing stays disabled.

## Verification

| Check | Result |
| --- | --- |
| Phase 1 migration/security + Phase 2 + Phase 3A tests | 106 passed, 0 failed |
| New Phase 3A tests | 46 passed |
| Full backend JavaScript syntax | 37 files passed |
| Frontend production build | Passed; 117 modules transformed |
| Frontend lint baseline | 11 errors, 1 warning |
| Frontend lint after changes | 10 errors, 1 warning; no new findings |
| `git diff --check` | Passed |

Test command, from `Bank-backend`:

```text
node --test --test-isolation=none scripts/phase1-migration.test.js scripts/phase1-security.test.js scripts/phase2-reports.test.js scripts/phase3a-milestones.test.js
```

New tests cover role/authentication denials, cross-branch Head Office authority, malformed IDs/bodies, missing reports, historical lowercase statuses, invalid transitions, spoofed metadata, locked-row selection, same-connection transactions, update/audit/commit failure rollback, connection release, repeated operations, all three submission paths, actor-name handling, final-locked immutability, and central reads. Existing tests continue verifying manager branch and historical access policy, draft operations, submitted immutability, server totals, transactions, India-safe dates, and migration/FK assumptions.

The test harness uses in-memory transaction snapshots and synthetic JWTs with real route/controller/middleware code; it never connects to the live database. It verifies rollback behavior through fault injection, not a live MySQL concurrency exercise.

Build initially encountered sandbox EPERM launching esbuild, then passed on the approved retry. Vite reports a bundle-size warning (517.47 kB JavaScript). Remaining lint findings are the existing `require` usage in `frontend/hash.js`, declaration-order findings in three dashboard files, and the central report effect dependency warning. Using `detailsLoading` removed its prior unused-variable error. No lint rules were changed.

## Live database activity and remaining risks

Only read-only schema inspection was performed: `SHOW CREATE TABLE daily_business_entries`, `SHOW CREATE TABLE daily_business_audit_logs`, and inspection of `users` columns `user_id`, `name`, and `role`. No live reports or audit rows were created, updated, deleted, or final-locked. No migration, seed, reset, or setup scripts were executed. No schema incompatibility was found.

Authorization retains the existing JWT role-claim freshness behavior. Milestone logging applies to future successful transitions; historical submitted reports are not backfilled. Browser end-to-end interaction and real concurrent MySQL sessions were not exercised. The existing frontend request/navigation behavior was not broadly refactored. Existing lint and bundle warnings remain outside this scope.

Git contains the Phase 3A modified/new files listed above alongside the preserved migration recovery work. No commit or push was performed.

Phase 3B unlock requests, approvals/rejections, corrections, and Head Office direct editing remain deferred. Dashboard/analytics redesign, legacy employee/task cleanup, and deployment were not performed. Work stops at Phase 3A.
