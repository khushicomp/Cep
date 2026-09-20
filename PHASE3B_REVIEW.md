# Phase 3B review

PHASE 3B IMPLEMENTED: YES  
LIVE BUSINESS DATA MUTATED BY TESTS: NO  
COMMITTED: NO  
PUSHED: NO

## Preflight and scope

Preflight ran `git status --short` and `git log --oneline -5`. HEAD remained `344a471` (Phase 2); the preceding commits were `80082a0`, `7570fcb`, `a10d727`, and `6cf2466`. The tree was not clean. Uncommitted Phase 3A and migration-recovery work was preserved without reset, discard, commit, or push.

Inherited modified files: `.gitignore`, business controller/routes/service, `scripts/phase1-migration.js`, `scripts/phase1-migration.test.js`, `scripts/phase2-reports.test.js`, and `AdminBusinessReports.jsx`. Inherited untracked files: shared `scripts/helpers/report-fixture.js`, `scripts/phase3a-milestones.test.js`, `services/business-audit.service.js`, `MIGRATION_EXECUTION_REVIEW.md`, `MIGRATION_RECOVERY_REVIEW.md`, and `PHASE3A_REVIEW.md`.

Phase 3B builds on that existing work. The specific additions are listed below; a diff against HEAD also contains the inherited work. Migration files, Phase 2/3A test files, prior reviews, and `.gitignore` were not changed during Phase 3B.

Inspected the report and audit services, controller/routes, authentication and role middleware, central and manager report UI, shared fixture and Phase 2/3A tests. Read-only live `SHOW CREATE TABLE` inspection confirmed `unlock_requested TINYINT(1) NOT NULL DEFAULT 0`, `unlock_reason TEXT`, nullable `submitted_at DATETIME`, and the existing audit JSON/reason columns. Both tables use InnoDB. Restrictive foreign keys and the unique branch/date key remain intact. No schema changes were needed.

## Phase 3B files changed

| File | Phase 3B change |
| --- | --- |
| `Bank-backend/services/business-report.service.js` | Shared correction transaction; request/approve/reject methods; reason validation; final-lock pending-request guard; minimal request fields in detail response |
| `Bank-backend/services/business-audit.service.js` | Three correction milestones; pending-state snapshots; preservation of request and decision reasons |
| `Bank-backend/controllers/business.controller.js` | Three handlers; normalized request fields in central detail response |
| `Bank-backend/routes/business.routes.js` | Three explicitly authorized routes |
| `frontend/src/components/DynamicEntryTable.jsx` | Manager correction request prompt, pending notice/reason, feedback and reconciliation |
| `frontend/src/components/AdminBusinessReports.jsx` | Pending reason, approve/reject controls, confirmation/note, reconciliation, final-lock suppression |
| `Bank-backend/scripts/helpers/report-fixture.js` | Unlock fields, correction writes/audits, optional serialized transaction simulation |
| `Bank-backend/scripts/phase3b-corrections.test.js` | New isolated regression and workflow tests |
| `PHASE3B_REVIEW.md` | This review |

## API and authorization

All routes require existing JWT authentication. Authority and branch context come from verified claims and locked report metadata, never client actor/status fields.

| POST endpoint | Role | Valid starting state | Result |
| --- | --- | --- | --- |
| `/api/business/entry/:id/unlock-request` | MANAGER | Own branch, SUBMITTED, no pending request | SUBMITTED; pending flag 1; trimmed reason |
| `/api/business/entry/:id/unlock-approve` | HEAD_OFFICE | Any branch, SUBMITTED, pending request | DRAFT; flag 0; active reason null |
| `/api/business/entry/:id/unlock-reject` | HEAD_OFFICE | Any branch, SUBMITTED, pending request | SUBMITTED; flag 0; active reason null |

Request/rejection bodies use `{ "reason": "..." }`. Approval needs no body. Reasons must be strings, trimmed and nonempty, with at most 1000 Unicode code points. This fits safely within the existing UTF-8 TEXT columns. Arrays, objects, numbers, and oversized reasons return 400.

Manager lookup uses `WHERE id = ? AND branch_id = ? FOR UPDATE`, preserving access to historical reports created by a previous manager of the same branch. Missing and cross-branch report IDs return 404. A conflicting supplied branch field is rejected with 403 under existing Phase 2 policy. Other spoofed actor/manager/status fields are ignored. Head Office resolution uses an unscoped report-ID lookup and the locked row's branch. ADMIN retains central reads and cannot request, approve, or reject corrections.

Invalid IDs/body structure return 400; unauthorized roles 403; missing reports 404; invalid lifecycle or pending-state combinations 409. Existing safe database-error handling and deadlock/lock-timeout conflict responses remain in effect. Historical lowercase statuses are normalized without bulk rewriting rows.

Detail and correction responses expose `unlock_requested` consistently as numeric 0/1 and `unlock_reason` only for an active request, otherwise null. No audit history or additional user internals are exposed.

## Lifecycle, timestamps, and transactions

Requesting correction does not unlock the report: it stays SUBMITTED and manager edit/delete/submit remain blocked. Approval alone reopens a pending SUBMITTED report as DRAFT. Rejection clears the request while retaining SUBMITTED. FINAL_LOCKED cannot request correction or be reopened by any added operation.

Approval explicitly clears `submitted_at`, because DRAFT is no longer currently submitted. Existing manager resubmission writes a fresh submission timestamp. Request and rejection leave that timestamp unchanged. Corrections never change branch, manager ownership, report date, items, or totals.

Each operation uses the existing dedicated mysql2 connection wrapper: begin transaction, `SELECT ... FOR UPDATE`, validate the locked state, update the header, insert one audit event, commit, and release. Failure rolls back both header and audit changes, then releases the connection. Existing broken-rollback connection disposal remains unchanged.

Final lock now selects `unlock_requested` under the same report lock and returns 409 when it is 1. Thus a pending request must be resolved before final locking. If request wins a race, final lock conflicts; if final lock wins, request conflicts on FINAL_LOCKED. Approval racing final lock while pending results in approval being allowed and final lock conflicting, whether it sees pending SUBMITTED or reopened DRAFT. Competing decisions or duplicate requests validate the latest locked state, so only the first valid transition succeeds.

After approval the existing draft edit/save/submit paths apply, including a new legitimate SUBMIT audit event. Reopened drafts with audit history cannot be deleted, preserving the existing friendly guard and restrictive audit FK.

## Audit history

The existing helper inserts append-only rows using authoritative entry/branch IDs, verified actor ID/role, database-resolved name, and the database timestamp default. Existing SUBMIT/FINAL_LOCK snapshots are preserved.

| Event | Actor | Previous/new state | Reason preservation |
| --- | --- | --- | --- |
| UNLOCK_REQUEST | MANAGER | SUBMITTED/flag 0 to SUBMITTED/flag 1 | Manager reason in audit `reason` |
| UNLOCK_APPROVE | HEAD_OFFICE | SUBMITTED/flag 1 to DRAFT/flag 0 | Original reason in previous-state `unlock_reason` and audit `reason` |
| UNLOCK_REJECT | HEAD_OFFICE | SUBMITTED/flag 1 to SUBMITTED/flag 0 | Original reason in previous-state `unlock_reason`; rejection note in audit `reason` |

Active reason clearing therefore never removes the historical explanation. No previous audit row is changed/deleted and no audit mutation endpoint was added. Only selected state/reason fields are written; extra body fields, tokens, passwords, and full request bodies are not captured. Reasons are user-authored text; users should avoid placing secrets in them. Network metadata remains null.

Verified approved sequence: `SUBMIT -> UNLOCK_REQUEST -> UNLOCK_APPROVE -> SUBMIT -> FINAL_LOCK`. Verified rejected sequence: `SUBMIT -> UNLOCK_REQUEST -> UNLOCK_REJECT`, after which final lock is permitted.

## Frontend

Managers see Request Correction only on SUBMITTED reports without a pending request. A prompt validates the required reason. Success shows feedback, sets pending state immediately, and refreshes the report. Pending state displays the reason and leaves the report read-only. Draft editing remains available after a refreshed approval; FINAL_LOCKED has no request action.

Central details display pending requests and their reasons. Only Head Office sees Approve/Reject Correction. Approval requires confirmation; rejection requires a validated note. Operations disable conflicting controls while in flight, update state immediately on success, and refresh details/summary. Final Lock is unavailable while pending and after approval; it returns after rejection. A 409 clears stale actionable status before reconciliation. Request reasons render as ordinary React text, not HTML. No dashboard redesign or direct central editing was added.

## Verification

| Check | Result |
| --- | --- |
| Existing Phase 1/2/3A tests | 106 passed |
| New Phase 3B tests | 69 passed |
| Combined suite | 175 passed, 0 failed |
| Full backend syntax | 38 JavaScript files passed |
| Frontend production build | Passed, 117 modules |
| Lint baseline | 10 errors, 1 warning |
| Lint after Phase 3B | Same 10 errors, 1 warning; no new findings |
| `git diff --check` | Passed |

Combined test command from `Bank-backend`:

```text
node --test --test-isolation=none scripts/phase1-migration.test.js scripts/phase1-security.test.js scripts/phase2-reports.test.js scripts/phase3a-milestones.test.js scripts/phase3b-corrections.test.js
```

The 69 tests cover all correction transitions, lowercase status, branch isolation, spoofed fields, role/authentication denials, malformed input, reason limits, metadata preservation, same-connection locked transactions, update/audit/commit rollback, release, duplicates, minimal reads, final-lock interaction, approval/edit/resubmission, append-only history, and both orders of competing operations. A serialized in-memory fixture models competing calls; it is not a real MySQL concurrency test. Existing tests remain unchanged and pass.

Build initially failed with sandbox EPERM when spawning esbuild; the approved retry succeeded. Vite retains its over-500-kB chunk warning (520.13 kB JavaScript). Existing lint findings remain `require` in frontend/hash.js, declaration-order errors in three legacy dashboards, and the central report effect dependency warning. Lint rules were not weakened.

## Live DB activity, limitations, and final Git state

Only `SHOW CREATE TABLE daily_business_entries` and `SHOW CREATE TABLE daily_business_audit_logs` were executed against the live database during Phase 3B. Tests use injected in-memory fixtures and synthetic authentication. No live reports/audits were created, changed, deleted, reopened, or final-locked. No migrations, seeds, resets, setup scripts, or deployment were run.

Browser end-to-end behavior and real concurrent MySQL sessions were not tested. Cross-session UI does not receive live push updates; users must refresh/reopen a report to observe another user's decision. Existing JWT claim freshness and broader frontend navigation/request behavior remain unchanged. Existing lint findings and the bundle warning remain. No additional schema constraints or historical audit backfill were introduced.

Final Git state remains uncommitted: the inherited modified/untracked files remain, with the Phase 3B changes listed above. `DynamicEntryTable.jsx` is newly modified in this phase; `phase3b-corrections.test.js` and this review are new untracked files. No commit or push was performed.

Deferred: reopening FINAL_LOCKED, direct Head Office editing, arbitrary status editing, audit-history dashboard, dashboard/analytics redesign, legacy employee/task cleanup, and deployment. Work stops at Phase 3B.
