# Phase 4B review

PHASE 4B IMPLEMENTED: YES  
LIVE BUSINESS DATA MUTATED BY TESTS: NO  
AUDIT MUTATION ENDPOINT ADDED: NO  
COMMITTED: NO  
PUSHED: NO

## Preflight and inspection

The working tree was clean at `419f92d add head office daily operations overview`. The preceding commits were `9c42cb2`, `344a471`, `80082a0`, and `7570fcb`. Phase 4A was committed before this work.

Inspected the audit writer, report service, controller/routes, Phase 3A/3B payload semantics and shared test harness, central report detail/Phase 4A integration, manager report UI, and database connection configuration. The actual audit table is `daily_business_audit_logs`, not the conceptual `daily_business_entry_audit` name in the request. Read-only schema inspection confirmed its ID, report/branch references, action, actor fields, JSON states, reason, timestamp, and optional network metadata. No schema changes were required.

## Files changed

- `Bank-backend/services/business-audit.service.js`: public event projection and safe state parsing; existing writer behavior unchanged.
- `Bank-backend/services/business-report.service.js`: authorized, branch-scoped history retrieval.
- `Bank-backend/controllers/business.controller.js`: history handler using existing safe error mapping.
- `Bank-backend/routes/business.routes.js`: read-only history route.
- `Bank-backend/scripts/phase4b-history.test.js`: 20 isolated tests.
- `frontend/src/components/ReportAuditHistory.jsx`: shared report-detail timeline with independent request states.
- `frontend/src/components/ReportAuditHistory.css`: small timeline styling additions.
- `frontend/src/utils/auditHistory.js`: action, state, timestamp, and reason presentation helpers.
- `frontend/src/components/AdminBusinessReports.jsx`: Head Office detail timeline integration.
- `frontend/src/components/DynamicEntryTable.jsx`: manager detail timeline integration.
- `PHASE4B_REVIEW.md`: this review.

## Endpoint and authorization

`GET /api/business/entry/:id/audit-history`

HEAD_OFFICE may read any existing report. MANAGER may read only reports in their authenticated branch, including reports created by a previous manager of that branch, consistent with the existing report-detail authorization policy. ADMIN and EMPLOYEE are denied this new authority; legacy ADMIN central reads remain unchanged. Unauthenticated callers are denied by existing JWT middleware.

Authorization is enforced in both route and service. Report IDs are validated. Manager branch scope comes only from verified identity; body/query branch or role fields cannot expand access. Missing and cross-branch reports both return the same safe 404. Invalid IDs return 400. No user identity, report ownership, or authentication architecture was changed.

## Read query strategy and ordering

First, select the report ID and branch ID, adding the authenticated branch predicate for managers. If no authorized report exists, stop before querying audits. Then select only useful audit fields using both the authorized report ID and its database branch ID. Both queries are parameterized SELECTs and have no write locks. History uses `ORDER BY created_at ASC, id ASC`, including deterministic timestamp ties.

An existing report with no audit rows returns `[]`. History is read from recorded events only; it is never reconstructed, fabricated, backfilled, edited, or deleted. No lifecycle changes or mutation endpoints were added.

## Safe response and state handling

The endpoint returns an array of projected events:

```text
id, action, actor_name, actor_role, created_at,
reason, requested_reason, previous_state, new_state
```

Actor IDs, report/branch internals, IP addresses, user agents, unrelated user fields, and complete raw JSON are omitted. No users-table join is needed: historical actor name and role come from the immutable event. Names are bounded to 100 characters and reasons to 1000 characters, matching current writer limits. Unknown roles/actions use UNKNOWN instead of returning arbitrary values.

State JSON may arrive as an already-parsed object or a string. Invalid JSON, nulls, arrays, scalars, and objects with no recognized fields become null. Only recognized lifecycle status and a normalized pending flag survive the public state projection. Nested/internal fields are discarded. A malformed state never removes its event or fails history retrieval.

Known action values remain SUBMIT, FINAL_LOCK, UNLOCK_REQUEST, UNLOCK_APPROVE, and UNLOCK_REJECT. Future/unknown stored actions are projected as UNKNOWN with an “Other audit event” label. Stored rows are not renamed. The UI renders friendly labels and lifecycle/pending-state text, never a JSON dump.

## Reason semantics

- UNLOCK_REQUEST: audit reason becomes “Requested reason”.
- UNLOCK_APPROVE: original manager reason comes from previous-state unlock_reason, with the existing audit reason as fallback. It is labelled “Requested reason”, not a new approval note.
- UNLOCK_REJECT: previous-state unlock_reason becomes “Requested reason”; audit reason becomes the Head Office “Decision note”.
- SUBMIT, FINAL_LOCK, and unknown actions do not expose arbitrary reason payloads.

Only the original request reason is extracted from previous-state JSON, separately from safe lifecycle state. Names/reasons are ordinary React text; no dangerouslySetInnerHTML is used. User-authored reason text is not a secret-detection system and remains visible to authorized report readers.

## Timestamp interpretation

Read-only inspection returned session timezone SYSTEM and system timezone India Standard Time. Audit created_at is a MySQL TIMESTAMP with CURRENT_TIMESTAMP default. The query uses DATE_FORMAT to return the database session's local `YYYY-MM-DD HH:mm:ss` calendar value as a string, avoiding mysql2 JavaScript Date conversion. The frontend formats string components directly into a readable day/month/year and 12-hour time with seconds. It never parses the value as UTC or applies the browser timezone. Null/unusable values display “Time unavailable”. The timeline identifies times as database local time (India).

This follows the inspected development database convention. A deployment that changes the database session timezone must revisit that label/convention; this phase does not reconfigure database timezones.

## Frontend behavior

Report History appears inside existing Head Office and manager report details. ADMIN does not receive the new timeline. It shows historical actor name/role, friendly event label, safe lifecycle/pending transition, timestamp, and correctly labelled reasons. Existing report controls and workflow remain intact.

History loading, empty history, and history errors are separate from report loading/existence. Failed history fetches show “Unable to load report history” with Retry, without treating the report as missing. Empty history shows “No audit history available for this report.”

Each fetch has effect-cleanup invalidation; result identity also includes report ID, revision, and retry number. Old requests cannot display their events under a newly selected report. Timeline instances are keyed by report ID. Central report refreshes trigger history refresh via the detail revision; manager status/pending changes refresh the timeline, and loading/remounting refreshes it after existing operations. No new dashboard or heavy frontend test framework was added.

## Tests and verification

| Check | Result |
| --- | --- |
| Existing Phase 1 through Phase 4A suite | 215 passed |
| New Phase 4B tests | 20 passed |
| Combined suite | 235 passed, 0 failed |
| Backend JavaScript syntax | 40 files passed |
| Frontend production build | Passed; 122 modules |
| Frontend lint baseline | 10 errors, 0 warnings |
| Frontend lint after | Same 10 existing errors, 0 warnings |
| git diff --check | Passed |

Test command from Bank-backend:

```text
node --test --test-isolation=none scripts/phase1-migration.test.js scripts/phase1-security.test.js scripts/phase2-reports.test.js scripts/phase3a-milestones.test.js scripts/phase3b-corrections.test.js scripts/phase4a-overview.test.js scripts/phase4b-history.test.js
```

Tests exercise real route/controller authorization using synthetic JWTs and injected, disposable in-memory SQLite. They cover Head Office cross-branch reads, manager own-branch access, cross-branch/missing 404s, spoofing, role denials, malformed IDs, empty history, approved and rejected sequences, chronological ordering and timestamp ties, whitelist fields, malformed/parsed/null states, reason distinctions, unknown actions, safe errors, and frontend presentation helpers. The fixture enforces SELECT-only application queries and checks that all audit rows are unchanged afterward. Existing tests and assertions were preserved.

The frontend build initially hit sandbox EPERM starting esbuild; the approved retry passed. Vite retains its existing bundle-size warning (527.70 kB JavaScript). Existing lint errors remain in frontend/hash.js and three legacy dashboards; lint rules were not disabled. No new lint findings were introduced.

## Live database activity, limitations, and Git status

Live database access was limited to SHOW CREATE TABLE daily_business_audit_logs and SELECT of session/system timezone variables. No live report, item, or audit rows were modified or backfilled. Automated tests never connect to the live database. No migration, seed, setup, reset, deployment, commit, or push was performed.

Browser end-to-end/network-race rendering tests were not run; request identity/cleanup behavior was reviewed in code, presentation helpers were tested, and the production build passed. SQLite tests do not model all MySQL behavior. History currently returns all milestones for one report without pagination; unusually long correction histories may eventually need pagination. Existing JWT claim freshness and lint/bundle limitations remain.

Final Git state contains only the Phase 4B modified/new files listed above, all uncommitted. HEAD remains 419f92d. No cleanup or deployment work was started. Work stops after Phase 4B.
