Phase 2 review — 2026-09-19

**1. Files inspected**

Started from clean commit `80082a0` on the existing branch. Inspected PHASE1_REVIEW.md; backend business controller/routes, authentication/role/branch middleware, auth controller, pool configuration, package scripts and Phase 1 tests; frontend App/Login, AdminDashboard, DynamicEntryTable, AdminBusinessReports, Sidebar, API/auth utilities, package scripts and ESLint configuration. Checked route/API references and report date/status handling. No applicable AGENTS.md was found. Phase 1 implementation and prepared migration were preserved.

Read-only live SHOW CREATE TABLE inspection confirmed daily_business_entries, daily_business_items and daily_business_audit_logs still match the Phase 1 findings: InnoDB, DECIMAL(15,2) amounts, DATE entry_date, VARCHAR report status, existing branch/date uniqueness, and the audit report FK still cascades.

**2. Files changed**

| File (repository-relative) | Change |
| --- | --- |
| Bank-backend/services/business-report.service.js — new | Branch-scoped report operations, lifecycle rules, validation, exact totals and dedicated-connection transactions. |
| Bank-backend/controllers/business.controller.js | Connect manager endpoints to the service; safe 4xx/5xx responses; normalize read statuses/calendar dates; include final-locked reports in central submitted-report reads. Existing analytics calculation remains unchanged. |
| Bank-backend/routes/business.routes.js | Manager-only mutations; HEAD_OFFICE/ADMIN central reads; explicit read-by-ID and submit endpoints; stop using legacy branch-view permissions for business reports. |
| Bank-backend/scripts/phase2-reports.test.js — new | 45 isolated service/controller/route/date/validation/transaction tests. No live database connection. |
| Bank-backend/scripts/phase1-security.test.js | Adapt the existing error-redaction regression test to the asynchronous business service and authenticated branch context; retain its assertions. |
| frontend/src/utils/businessDate.js — new | Asia/Kolkata calendar-date helper without a timezone dependency. |
| frontend/src/components/DynamicEntryTable.jsx | Normalize statuses, lock non-drafts, stop decoding/sending branch identity, accept zero amounts, preserve decimal text and date labels, keep row removal as DRAFT, surface safe validation errors. |
| frontend/src/components/AdminBusinessReports.jsx | Central report UI read-only; canonical status compatibility; India date defaults and direct date-label history navigation. Fix the selected history date passed into the existing detail fetch. |
| frontend/src/App.jsx | Permit HEAD_OFFICE on the existing central report page. |
| frontend/src/pages/Login.jsx | Route HEAD_OFFICE login to that existing page. |
| frontend/src/pages/AdminDashboard.jsx | Skip legacy task requests/tab for HEAD_OFFICE; keep legacy ADMIN/task functionality. No new dashboard. |
| PHASE2_REVIEW.md — new | This implementation/verification record. |

No package, dependency, .env, pool configuration, JWT expiry, migration or schema files changed.

**3. Branch isolation and authorization**

All /api/business routes verify the JWT. Manager report service methods take identity from req.user, never body/query/frontend state. A positive authenticated branch_id and user_id are required. Client branch_id/branchId values that conflict during create/update are rejected with 403; branch identity is always derived from the authenticated user. Supplied manager IDs, names and aggregates do not override server identity/data.

Manager query tenancy:

- By-date read: `WHERE e.branch_id = ? AND e.entry_date = ?`.
- By-ID read: `WHERE e.branch_id = ? AND e.id = ?`.
- History: `WHERE branch_id = ?`.
- Update/delete/submit lookup: `WHERE id = ? AND branch_id = ? FOR UPDATE`.
- Header update/delete: `WHERE id = ? AND branch_id = ?` on that same connection.
- Child operations use only the entry ID obtained from the locked, branch-authorized header.
- Create fixes branch_id/user_id from the verified user, loads display metadata from branches/users, and uses the existing unique branch/date index.

No manager_id ownership restriction remains for report access: the current manager can work with the branch's draft left by a previous manager. A matching manager_id on another branch does not grant access. Missing/cross-branch report IDs return indistinguishable 404 responses. can_view_all_branches is never used by the report service, even if present in a JWT; body/query flags cannot widen scope. Legacy branch middleware remains unchanged for unrelated systems.

HEAD_OFFICE and transitional ADMIN may read /all-branches, /branch/:id, /reports, /branch-history/:branchId and /entry/:id. Managers receive 403 on the central endpoints. All report create/update/delete/submit routes are MANAGER-only; central roles and EMPLOYEE cannot mutate reports. ADMIN read compatibility is retained; its old unrestricted report editing is intentionally disabled with the unsafe central mutation path. Legacy task/user endpoints are unchanged.

**4. State machine and API behavior**

Stored statuses are trimmed/uppercased when compared or returned. Existing lowercase rows are not rewritten merely by reads. New/edited report writes use canonical DRAFT or SUBMITTED. Item status is a separate business field and retains its existing meaning.

| Current state | Manager behavior |
| --- | --- |
| New report | Default DRAFT; explicit valid SUBMITTED supported by creating a draft, inserting items and transitioning in one transaction. FINAL_LOCKED/arbitrary initial statuses rejected with 400. |
| DRAFT | Read, edit, delete or submit within authenticated branch. Editing without status keeps DRAFT. |
| SUBMITTED | Read-only; edit/delete/resubmit/downgrade return 409, including historical lowercase submitted. |
| FINAL_LOCKED | Read-only; all manager mutations return 409, including lowercase variants. |
| Unknown/NULL status | Fails closed for mutation with 409. |

Existing POST /api/business/daily-entry and PUT /api/business/entry/:id accept valid draft/save-and-submit requests for UI compatibility. New POST /api/business/entry/:id/submit submits the existing persisted items; request-body items/totals/status cannot alter that transition. New GET /api/business/entry/:id supplies a branch-protected manager read and a central read.

Repeated submission deliberately returns 409 with no writes; it does not refresh timestamps or replace items. No manager transition to FINAL_LOCKED exists. No unlock/final-lock/correction endpoint was added.

Draft deletion is also refused with 409 if audit history exists, to preserve history while the existing audit FK still cascades. This exception protects the Phase 1 audit-retention requirement without executing its migration.

**5. Transactions and rollback**

Each write obtains one connection through `pool.promise().getConnection()` (mysql2's promise wrapper around the pool), then calls that connection's beginTransaction/query/commit. No pooled BEGIN/COMMIT calls are used. Existing-report operations lock the branch-authorized header with SELECT ... FOR UPDATE before inspecting status or writing. Competing report mutations therefore serialize on that header.

| Operation | Atomic work |
| --- | --- |
| Create | Read authenticated manager/branch metadata; insert draft header; insert items; optionally transition to SUBMITTED. |
| Update | Lock/authorize draft; validate date/items/target state; delete old items; insert replacements; update computed totals/status/timestamp. |
| Delete | Lock/authorize draft; check audit history with a locking read; delete items and header together. |
| Submit | Lock/authorize draft; read persisted items with a locking read; validate and sum them; update totals/count/status/submitted_at together. |

Any failure after begin rolls back. Connections are released in finally; a failed rollback destroys the connection before release so an uncertain transaction is not reused. Commit failure also attempts rollback. Network loss during commit can still have an ambiguous outcome; reload before retrying. Duplicate branch/date conflicts and referenced-record deletion conflicts return 409; lock timeout/deadlock returns a safe retryable 409. Other driver errors return generic 500 responses without SQL/data.

No audit events are inserted in this phase. Row locks and existing audit foreign keys also prevent a concurrent FK-backed audit insertion from bypassing the delete guard while the parent is locked. Direct database administration remains outside application authorization.

**6. Server-side totals**

Existing business meaning is preserved: report total_amount equals the sum of item amounts; total_entries equals item count. Both are derived server-side on create, update and submit. Client totalAmount/total_entries values are ignored.

Amounts are parsed into BigInt minor units and summed exactly, then serialized as decimal strings for DECIMAL(15,2). For example, 0.10 + 0.20 stores 0.30. Explicit submit recalculates from persisted items rather than body items. Zero is valid. Negative amounts are rejected consistently with the existing amount input's min=0; no positive-only rule remains. Maximum item/aggregate amount is 9,999,999,999,999.99. More than two fractional digits are rejected rather than silently rounded.

**7. Validation**

- Real YYYY-MM-DD calendar dates, including leap-year/day checks and MySQL DATE year range (1000–9999).
- Existing report date is immutable through update; inconsistent date/entry_date fields are rejected.
- Positive signed-INT-range report/branch/serial IDs and unique serial numbers within a payload; omitted serials use row order.
- Between 1 and 1000 item objects, with nonblank accountType (maximum 100 characters) and item status (maximum 50 characters). The existing free-text account/category semantics remain; no new financial category taxonomy is imposed.
- Optional string remark within MySQL TEXT's 65,535-byte capacity.
- Non-negative decimal string/number amounts, finite and within precision/range; reject booleans, null/missing values, arrays/objects, malformed text, exponents, excess precision and sum overflow.
- Valid initial/target report status and DRAFT-only mutation, checked independently of frontend state.
- Malformed body shapes return 400. Cross-branch/nonexistent IDs return 404; forbidden roles/branch spoofing 403; lifecycle/uniqueness conflicts 409.

Drafts require at least one structurally valid item. The existing frontend's blank draft amount maps explicitly to zero; submission accepts explicit zero. Decimal text is no longer converted through Number before being sent, avoiding avoidable client precision loss. Any remaining Number calculations in the UI are display-only.

**8. Date handling**

Report entry dates are calendar labels, not timestamps. Backend reads format MySQL DATE with DATE_FORMAT(..., '%Y-%m-%d') instead of serializing it as a JavaScript Date. Frontend history displays/reuses that date string directly. Today's default and maximum report date use Intl.DateTimeFormat with Asia/Kolkata in both relevant frontend report components; backend central reads use the same calendar zone for an omitted date. Tests cover the 18:30 UTC boundary that starts the next day in India. Existing non-report timestamp handling was not redesigned.

**9. Tests added**

45 new isolated tests plus 11 existing Phase 1 tests: **56 passed, zero failed**.

New scenarios cover:

1. Own-branch reads, including a report created by a different historical manager.
2. Cross-branch read-by-ID rejection even when manager_id matches.
3. Cross-branch update, delete and submit rejection.
4. Body branch_id/branchId spoof rejection on create.
5. Draft edit/delete success; preserved other-branch data.
6. Edit/delete/submit denial for lowercase/canonical SUBMITTED and FINAL_LOCKED, unknown and NULL states; no downgrade to DRAFT.
7. Explicit persisted-item submission and repeat-submission conflict without mutation.
8. Create-and-submit and update-and-submit compatibility in one transaction.
9. Forged initial/status values and changed dates rejected.
10. Server-derived creator/branch/counts/totals despite forged inputs; exact decimal addition and valid zero.
11. Existing uniqueness failure rolls back and maps to HTTP 409.
12. Branch-scoped history/date reads even with can_view_all_branches in authenticated claims.
13. HEAD_OFFICE and ADMIN cross-branch reads, with all their mutations denied.
14. Real JWT/role middleware and all four central read routes; manager request role/branch/view-all overrides cannot escalate access.
15. Unauthenticated/EMPLOYEE report access denial.
16. Audited-draft deletion guard.
17. Failed create/update/delete/submit, commit and begin rollback/release behavior; failed rollback destroys the connection.
18. Item shape/required fields/serials, malformed numbers, precision/range/aggregate overflow, invalid calendar dates and India-midnight behavior.
19. Safe HTTP error redaction and per-connection transaction/locking SQL assertions.

Database behavior is mocked before importing controllers/routes. Test requests use synthetic JWTs and real verification/role middleware but no network listener or live credentials. The existing Phase 1 application-load check imports the lazy pool without acquiring connections. No test invokes the migration or writes to the live database. These tests do not constitute a real-MySQL concurrency/failure integration test.

**10. Commands executed**

Read-only repository inspection used git status --short, git log -1 --format=%h, git diff, rg and Get-Content. Relevant verification commands:

```powershell
# From Bank-backend:
node --check services/business-report.service.js
node --test --test-isolation=none scripts/phase2-reports.test.js scripts/phase1-security.test.js scripts/phase1-migration.test.js

# From frontend:
npm run build
npm run lint

# From repository root:
$files = @(rg --files Bank-backend -g '*.js' -g '!node_modules')
foreach ($file in $files) {
    node --check $file
    if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $file" }
}
git diff --check
git diff --exit-code -- Bank-backend/scripts/phase1-migration.js Bank-backend/config/db.js Bank-backend/controllers/auth.controller.js
git status --short
```

Lint output was temporarily redirected to .phase2-lint.txt to summarize it. For baseline comparison, original tracked frontend JavaScript was extracted with `git show HEAD:<path>` into temporary JSON and checked with ESLint.lintText using original filenames. Temporary lint artifacts were removed. Live schema inspection used an inline Node mysql2/promise script running only the three SHOW CREATE TABLE queries listed below, then closing the connection.

**11. Verification results**

- Final combined test run: exit 0, 56/56 passed. The initial run found one test-stub bug (SELECT matching also caught DELETE); corrected the stub and strengthened replacement-item assertions before the successful rerun.
- Backend syntax: 34 files passed; exit 0.
- Frontend build: initial sandbox attempt failed with spawn EPERM; authorized outside-sandbox retry passed, 117 modules, 6.93 seconds. Existing >500 kB bundle warning remains (JS 516.47 kB).
- Frontend lint: exit 1, 11 errors and one warning. HEAD baseline independently confirmed 13 errors and one warning across 17 source files. Removing obsolete JWT decoding/empty catch eliminated two errors. Remaining errors are pre-existing CommonJS require, unused detailsLoading and React declaration-order problems; existing effect-dependency warning remains. No lint rules disabled.
- git diff --check: passed.
- Phase 1 migration, pool config and auth-controller preservation check: exit 0, unchanged.
- No mutating real-database or browser end-to-end tests were performed.

**12. Database activity**

PHASE 1 MIGRATION EXECUTED: NO

The only live database operations in this phase were:

```sql
SHOW CREATE TABLE daily_business_entries;
SHOW CREATE TABLE daily_business_items;
SHOW CREATE TABLE daily_business_audit_logs;
```

No CREATE/ALTER/DROP/TRUNCATE/INSERT/UPDATE/DELETE/REPLACE was executed. No business rows, user/branch IDs, role values or report statuses were changed in the live database. New application write paths were exercised only with mocked connections. Legacy destructive scripts were not run. .env was neither modified nor printed.

**13. Remaining risks/issues**

- The prepared Phase 1 migration is still unapplied. The application now guards audit-bearing draft deletion, but the live cascade and other pending schema hardening still need separately authorized review/execution.
- Report row-lock/rollback behavior has automated mocked coverage, not a live MySQL integration exercise. Use an isolated database for future concurrency/infrastructure-failure testing.
- JWT identity/branch claims remain valid until token expiry; account deactivation/branch reassignment is not rechecked on every operation. Create additionally checks the current user/branch relationship. No authentication redesign was requested.
- Existing analytics joins can overcount totals; the central overview frontend also has pre-existing aggregate field-name inconsistencies. No analytics redesign was performed.
- Unrelated legacy task assignment isolation, seeding/setup hazards and credential-policy risks from Phase 1 remain deferred.
- Legacy ADMIN report mutation access is now intentionally denied. Both central roles retain report reads; their future correction workflow must be separately designed.
- Existing unknown/null report states fail closed and need manual review; this phase does not normalize database rows in bulk.
- Existing frontend requests can still race during rapid navigation; backend tenancy/state enforcement remains authoritative. No broader UI/network-state redesign was attempted.
- Lint and bundle-size warnings remain as recorded above.

**14. Deliberately deferred functionality**

No unlock requests/approvals, correction or maker-checker flow, Head Office final-lock mutation, audit event workflow, new dashboard, analytics/export redesign, employee/task removal, user cleanup, password reset, refresh tokens/OAuth, infrastructure/deployment, Docker or Redis. EmployeeDashboard, legacy roles, task routes/controllers/tables, task_updates and time_logs remain. No schema migration was changed or executed. No Phase 3 work started.

**15. Git status and stopping point**

Phase 2 changes are uncommitted on the original branch. Phase 1 commit remains intact. No branch switch, merge, rebase, reset or history rewrite was performed.

COMMITTED: NO

PUSHED: NO

Stopped after Phase 2 for review.
