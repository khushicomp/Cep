Phase 1 review — 2026-09-19

**1. Repository inspection**

Inspected backend app/server, all routes/controllers/middleware, database configuration, schema.json, migrations/setup/seed/debug scripts, both package manifests, ignore files, frontend routing/auth/API utilities, report-entry components and dashboard/API call sites. No AGENTS.md instructions or deployment manifests were found. The initial working tree was clean.

React 19/Vite frontend uses Axios with VITE_API_URL (localhost fallback), localStorage Bearer JWTs, and client role guards. Express 5 uses Helmet, CLIENT_URL-based CORS, JWT verification, role middleware and branch filtering. MySQL controllers use callback queries, without transaction/session APIs. Backend scripts only provide start/dev; frontend provides dev/build/lint/preview. Existing test-named scripts are database/debug utilities, including a destructive DELETE request; none were executed.

Current operational code recognizes ADMIN, MANAGER and EMPLOYEE. Manager reports are consolidated headers plus daily_business_items; frontend uses lowercase draft/submitted, backend accepts submitted in either case. Report reads/edits largely use manager ownership, with ADMIN override. Legacy task/report/user endpoints remain registered. Branch middleware grants cross-branch reads to ADMIN or can_view_all_branches claims. No complete report state machine exists.

**2. Every changed file and purpose**

Paths below are relative to the repository root. New files are marked “new”.

| File | Purpose |
| --- | --- |
| .gitignore (new) | Ignore environment variants, private-key files, dependencies, build output and logs across the repository. |
| Bank-backend/app.js | Unregister both debug route modules; retain files after checking references. |
| Bank-backend/config/db.js | Replace single connection with callback-compatible pool. |
| Bank-backend/controllers/auth.controller.js | Remove authentication-result/email logging; redact database error log; set JWT expiry to 10h. |
| Bank-backend/controllers/business.controller.js | Replace raw database-error responses with generic messages. |
| Bank-backend/controllers/dbTest.controller.js | Redact error response in the now-unregistered debug controller. |
| Bank-backend/controllers/report.controller.js | Redact error responses/logging. |
| Bank-backend/controllers/task.controller.js | Redact errors; remove decoded-user and task-body logging. |
| Bank-backend/controllers/user.controller.js | Redact errors/logging, including errors that could contain inserted password hashes. |
| Bank-backend/middleware/error.middleware.js | Generic client errors and safe logging; handle already-sent responses. |
| Bank-backend/check_db.js | Remove business-row dumps and raw driver errors. Not executed. |
| Bank-backend/test_db.js | Remove business-row dumps and raw driver errors. Not executed. |
| Bank-backend/test_delete.js | Remove JWT/error-detail logging. Not executed. |
| Bank-backend/migrations.js | Redact utility error logging only; existing migration behavior unchanged. Not executed. |
| Bank-backend/setup_branches.js | Redact utility error logging only. Not executed. |
| Bank-backend/setup_db_business.js | Redact utility error logging only. Not executed. |
| Bank-backend/seed_test_users.js | Remove password output and raw errors. Not executed. |
| Bank-backend/scripts/seed-all-users.js | Remove password-bearing output and raw errors. Not executed. |
| Bank-backend/scripts/phase1-migration.js (new) | Read-only inspection/planning by default; guarded future migration application. |
| Bank-backend/scripts/phase1-migration.test.js (new) | Seven mocked migration-safety tests; no database connection. |
| Bank-backend/scripts/phase1-security.test.js (new) | Four security/module-loading checks; no database writes. |
| frontend/hash.js | Remove password-hash output. Not executed. |
| frontend/src/utils/toast.js | Safe DOM text/node creation; retain icons, styles and timers. |
| frontend/src/components/AdminBusinessAnalytics.jsx | Avoid logging Axios errors containing headers/request data. |
| frontend/src/components/AdminBusinessReports.jsx | Same logging redaction. |
| frontend/src/components/DynamicEntryTable.jsx | Same logging redaction. |
| frontend/src/pages/AdminDashboard.jsx | Same logging redaction. |
| frontend/src/pages/EmployeeDashboard.jsx | Same logging redaction. |
| frontend/src/pages/Login.jsx | Avoid logging Axios login errors containing passwords and request configuration. |
| frontend/src/pages/ManagerDashboard.jsx | Avoid logging Axios request headers/data. |
| frontend/src/pages/MyTasks.jsx | Same logging redaction. |
| PHASE1_REVIEW.md (new) | Inspection, migration, verification and review record. |

Unused catch bindings created by logging redaction were removed; UI behavior was not redesigned.

**3. Security changes**

/api/db-test (previously returned complete users rows) and /api/test are no longer mounted. No files or legacy systems were deleted. Database errors no longer reach clients as driver objects, SQL or internal messages. Logs no longer dump authentication results, JWTs, password hashes, passwords, decoded users or Axios request objects. Toast message content is inserted as a text node; loading UI also uses DOM creation APIs. Newly issued JWTs expire after ten hours. Previously issued tokens retain their original expiry.

**4. Database connection**

Previously: one mysql2.createConnection with a startup connect callback. Now: lazy mysql2.createPool using DB_HOST, DB_USER, DB_PASSWORD, DB_NAME and optional DB_PORT (3306 default). Limits: 10 connections, 10 idle, 60-second idle timeout, 100 queued requests, 10-second connect timeout, keepalive enabled. db.query callback signatures and bulk VALUES formatting remain compatible; no controller transaction APIs were found. Pool acquisition/release is handled by mysql2 for individual queries. No new credentials or .env edits.

**5. Read-only live database inspection**

MySQL 8.0.44; inspected relevant SHOW CREATE TABLE output, SHOW FULL COLUMNS, SHOW INDEX, information_schema metadata, aggregate counts, duplicate and orphan SELECT queries. The checked-in schema.json is stale.

| Object | Observed live state |
| --- | --- |
| branches | 38 rows; InnoDB; signed INT branch_id primary key; unique branch_code. |
| users | Signed INT user_id primary key; unique email; branch_id index and restrictive FK to branches. |
| users.role | ENUM('EMPLOYEE','MANAGER','ADMIN','HEAD_OFFICE') NOT NULL DEFAULT 'MANAGER'. Counts: HEAD_OFFICE 1, MANAGER 37, EMPLOYEE 20, ADMIN 0. |
| daily_business_entries | InnoDB; signed INT id/branch_id/manager_id; entry_date DATE NOT NULL; primary key id. Seven rows, all status submitted. |
| Report status | VARCHAR(50), nullable, default 'draft'; already accommodates all three future lifecycle strings. No normalization needed now. |
| Report unique index | unique_branch_entry_date over (branch_id, entry_date), already present. |
| Report foreign keys | No branch_id or manager_id foreign keys. |
| Unlock fields | unlock_requested TINYINT(1) DEFAULT 0, nullable; all seven values are 0; unlock_reason nullable TEXT. |
| daily_business_items | Signed INT id primary key; entry_id index and FK to entries with ON DELETE CASCADE. Preserved. |
| Audit table | Already exists, empty. id primary key; entry_id/branch_id/actor_id indexes; entry FK uses ON DELETE CASCADE, branch/actor FKs restrictive. |

Duplicate branch/date reports: none. Orphaned report branch/manager references: none. Orphaned audit entry/branch/actor references: none. No null/non-boolean unlock flags found. These are inspection-time findings, not a guarantee against subsequent writes.

**6. Migration prepared**

Review Bank-backend/scripts/phase1-migration.js. Its default mode and --inspect issue only SELECT/SHOW queries and print SQL as a plan. Printing SQL does not execute it. No startup/package script invokes it. --apply is reserved for a separately authorized future step and was NOT used.

For the observed live schema, the exact proposed DDL is:

```sql
ALTER TABLE daily_business_entries MODIFY COLUMN unlock_requested tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `daily_business_entries` ADD CONSTRAINT `phase1_entry_branch_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`branch_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `daily_business_entries` ADD CONSTRAINT `phase1_entry_manager_fk` FOREIGN KEY (`manager_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `daily_business_audit_logs` DROP FOREIGN KEY `daily_business_audit_logs_ibfk_1`, ADD CONSTRAINT `daily_business_audit_logs_ibfk_1` FOREIGN KEY (`entry_id`) REFERENCES `daily_business_entries` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
```

No status/role changes or new unique index/table are needed on this database. No user conversion/deactivation is included. Existing IDs, rows, defaults and legacy roles are preserved.

Rerun strategy: inspect metadata and data before planning; compare unique indexes by full columns regardless of name/order (prefix/extra-column indexes do not count); compare foreign keys by table/column/parent semantics. Existing compatible objects are no-ops. Missing unlock columns, unique index, compatible foreign keys or audit table can be prepared. Enum extension preserves old values/defaults; ambiguous case variants, CHECK constraints and unexpected schema types stop for manual review.

Duplicates block only the unique-index portion and report branch_id, entry_date, each entry ID, duplicate_count and item_count without truncating ID lists. Orphans block their foreign-key portion and report affected IDs. Null/non-boolean unlock flags block tightening; no silent backfill. Blocked portions produce exit code 2. Driver/schema failures stop execution with a safe diagnostic; completed DDL is not rolled back. MySQL DDL implicitly commits, so this is explicitly not a transactional migration. Quiesce writers and take a backup before any future authorized application; concurrent incompatible writes will cause constraints to fail rather than delete data.

Audit design follows the existing table: id, entry_id, branch_id, action, actor_id, actor_role, actor_name, previous_state/new_state JSON, reason, ip_address, user_agent, created_at. Existing history is preserved; future report/user/branch deletion is restricted by its references. No audit-event writing workflow is added. Database permissions/append-only enforcement remain future work.

**7. Database execution status**

MIGRATION EXECUTED: NO

No CREATE/ALTER/INSERT/UPDATE/DELETE/DROP/TRUNCATE/REPLACE statements were executed against the database. Inspection used read-only metadata/data queries; the pool check used SELECT 1. Legacy migration/setup/seed/destructive-test scripts were not run.

**8. Verification**

Executed from Bank-backend unless noted:

| Command/check | Result |
| --- | --- |
| node --version | v23.7.0. |
| node scripts/phase1-migration.js --inspect | Exit 0; four proposed steps, no blocked portions; explicitly reports migration not executed. Rechecked after edits. |
| node --test --test-isolation=none scripts/phase1-migration.test.js | Seven mocked checks passed. |
| node --test --test-isolation=none scripts/phase1-migration.test.js scripts/phase1-security.test.js | Eleven checks passed, zero failures; no database writes. |
| node --check for each backend .js outside node_modules | All 32 files passed. |
| Pool callback db.query('SELECT 1 AS ok', callback), then db.end() | PASS against live database. |
| npm run build (frontend) | Initial sandbox attempt failed with spawn EPERM; approved outside-sandbox retry passed, 116 modules. Build warns about a JS chunk larger than 500 kB. |
| npm run lint (frontend) | Exit 1: 13 errors, one warning. Original HEAD contents independently linted with ESLint.lintText: same 13 errors, one warning across 17 source files. No new remaining lint failures. |
| git diff --check | Passed; Git emitted only line-ending conversion notices. |
| git check-ignore Bank-backend/.env frontend/.env .env.production example.key | All four ignored. No project .env file is tracked. |

Backend syntax command from repository root:

```powershell
$files = @(rg --files Bank-backend -g '*.js' -g '!node_modules')
foreach ($file in $files) {
    node --check $file
    if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $file" }
}
```

Read-only inspection also ran inline Node scripts using SHOW CREATE TABLE for entries/items/branches/users/audit, SELECT VERSION(), role/status/branch/audit counts, duplicate and orphan checks. No login against real user credentials and no mutating integration tests were performed. The security module-load test confirms application imports register no debug routes and acquire zero database connections. Mock tests validate logic, not execution of MySQL DDL; actual migration execution remains unverified by design.

Existing lint failures concern CommonJS require in frontend/hash.js, unused detailsLoading, an empty catch, React function declaration order and one effect dependency warning. An initial baseline-comparison attempt could not spawn Git in the sandbox and yielded no usable baseline; the subsequent PowerShell git-show extraction plus ESLint check produced the verified baseline above. Temporary comparison artifacts were removed.

**9. Deliberately not changed**

No full lifecycle enforcement, unlock/correction endpoints, role rollout, dashboards, analytics rewrite, authentication redesign, refresh tokens, cookies, employee deactivation/removal, task-system removal, deployment or infrastructure work. No business records or IDs were changed. .env was neither edited nor printed. Legacy setup/seed scripts retain their existing behavior; only sensitive output was removed.

**10. Remaining risks / review questions**

- Live HEAD_OFFICE user cannot use existing ADMIN-only route/UI authorization. This pre-existing database/application mismatch needs a separately scoped role rollout; no users were remapped.
- Submitted reports remain editable/deletable and arbitrary status input remains accepted; state enforcement is intentionally deferred.
- Multi-query report create/update/delete operations are non-transactional. The delete controller removes items before deleting the report. Once restrictive audit FKs are applied and audit events exist, a report deletion could fail after items were deleted. Resolve this ordering/transaction issue before activating audit-backed deletion restrictions in production.
- Task assignment accepts assigned_to without verifying that employee belongs to the manager's branch. Report ownership is manager-based rather than complete branch-based authorization. These existing isolation gaps were not expanded into unrelated fixes.
- Analytics sums report totals across item joins, which can overcount totals. Left unchanged.
- Legacy setup_branches.js drops/recreates branches, seed-all-users.js deletes users, and test_delete.js issues a DELETE request. Do not use these as verification or as the Phase 1 migration. No such script was executed.
- Existing seed credentials are hardcoded in utility source and generated user passwords use a small random space. Secret logging is removed, but credential-policy changes are outside this phase.
- Existing JWTs retain their original expiry; deactivation/role changes are not rechecked on every request. LocalStorage architecture is unchanged.
- Backend node_modules is already tracked in Git. Ignore rules prevent new untracked dependencies/secrets but do not untrack existing files or remove history. No dependency cleanup or history rewrite performed.
- Migration has not been executed; audit cascade and nullable unlock flag remain in the live database until separately reviewed/authorized.

**11. Git status and stopping point**

All modifications/new files remain uncommitted for review. Nothing was committed, pushed, merged, rebased or reset. No deployment was performed. Phase 1 ends here; migration execution and Phase 2 require a later instruction.
