Phase 1 migration recovery — 2026-09-19

PHASE 1 MIGRATION COMPLETE: YES

DATA ROWS CHANGED: NO

COMMITTED: NO

PUSHED: NO

**1. Pre-recovery schema**

Fresh SELECT/SHOW/information_schema inspection confirmed the exact required partial checkpoint. unlock_requested was TINYINT(1) NOT NULL DEFAULT 0; phase1_entry_branch_fk and phase1_entry_manager_fk already used ON DELETE/UPDATE RESTRICT. UNIQUE(branch_id, entry_date) remained under unique_branch_entry_date. The audit entry relationship still used daily_business_audit_logs_ibfk_1 with ON DELETE CASCADE, and the audit table was empty.

Counts were branches 38, users 58, reports 7, items 7, audit rows 0. No duplicates, relevant orphans or invalid unlock flags existed. Full-row/ID fingerprints and all five table schemas matched the prior post-failure snapshot. Database constraint inspection confirmed phase1_audit_entry_fk was unused. Only the inspection session and idle scheduler daemon were present in the database session listing.

The working tree contained only the expected previous migration safety edits and review document. Existing work was preserved; the current commit remains Phase 2 at 344a471.

**2. Migration-script change**

Minimally changed the existing FK replacement branch to use its deterministic target name rather than reusing the constraint being dropped. Before replacement, it checks for a case-insensitive name collision across existing database foreign keys and blocks if occupied. Existing semantically equivalent restrictive relationships remain no-ops regardless of name. The previous rule that ANY blocked pre-flight prevents ALL apply DDL remains intact, as do successful-step completion messages.

No manual substitute SQL or application behavior changes were introduced.

**3. Isolated migration tests**

Expanded the metadata fixture to represent the partial checkpoint, the renamed completed state, and a cross-table name collision. Added three tests:

- Partial recovery plans exactly one ALTER replacing the old cascade with the new restrictive FK name.
- Completed recovery plans zero DDL on repeated inspection.
- A replacement-name collision, including different letter case, blocks rather than dropping the existing FK.

Retained tests for already-correct restrictive FKs under other names, semantic indexes, duplicates/orphans/unlock checks, and blocked apply issuing zero DDL. Migration-only run: 11 passed, zero failed.

**4. Exact DDL executed**

After inspection and tests, the planner proposed only the following statement. It was shown before applying and executed once via `node scripts/phase1-migration.js --apply` from Bank-backend:

```sql
ALTER TABLE `daily_business_audit_logs`
  DROP FOREIGN KEY `daily_business_audit_logs_ibfk_1`,
  ADD CONSTRAINT `phase1_audit_entry_fk`
  FOREIGN KEY (`entry_id`) REFERENCES `daily_business_entries` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
```

Apply exited 0 and printed successful completion. No other DDL, data-changing statements, seed/setup/reset scripts, or backup restore was executed. --apply was not run a second time.

**5. Final schema and foreign keys**

| Relationship/object | Verified final definition |
| --- | --- |
| daily_business_entries.unlock_requested | TINYINT(1) NOT NULL DEFAULT 0 |
| unique_branch_entry_date | UNIQUE(branch_id, entry_date), unchanged |
| phase1_entry_branch_fk | entries.branch_id → branches.branch_id; DELETE RESTRICT, UPDATE RESTRICT |
| phase1_entry_manager_fk | entries.manager_id → users.user_id; DELETE RESTRICT, UPDATE RESTRICT |
| phase1_audit_entry_fk | audit.entry_id → entries.id; DELETE RESTRICT, UPDATE RESTRICT |
| daily_business_audit_logs_ibfk_1 | Absent |
| daily_business_audit_logs_ibfk_2 / ibfk_3 | Existing restrictive audit branch/actor relationships unchanged |
| daily_business_items_ibfk_1 | items.entry_id → entries.id; original ON DELETE CASCADE relationship unchanged |

MySQL changed the audit entry_id supporting index name from entry_id to phase1_audit_entry_fk as part of the ALTER; its indexed column remains entry_id. Only the audit table schema changed during recovery. branches, users, entries and items SHOW CREATE TABLE definitions match the recovery pre-flight exactly.

**6. Before/after row counts and data preservation**

| Table | Before recovery | After recovery | Full rows and IDs |
| --- | ---: | ---: | --- |
| branches | 38 | 38 | Unchanged |
| users | 58 | 58 | Unchanged |
| daily_business_entries | 7 | 7 | Unchanged |
| daily_business_items | 7 | 7 | Unchanged |
| daily_business_audit_logs | 0 | 0 | Unchanged |

Canonical full-row SHA-256 fingerprints and independent ID fingerprints match for all five tables. User roles, report amounts/statuses/timestamps and other existing row fields were preserved. All seven reports retain their lowercase submitted status. User roles remain 37 MANAGER, 1 HEAD_OFFICE and 20 EMPLOYEE. Row contents were not printed or saved in the verification snapshots; only schema, counts and fingerprints were recorded.

**7. Duplicate/orphan checks**

Before and after recovery: no duplicate branch/date reports; no orphan report branch/manager references; no orphan audit entry/branch/actor references; no invalid or NULL unlock flags. Existing item relationship and data are unchanged.

**8. Zero-DDL inspection**

After the final schema/data comparison, ran `node Bank-backend/scripts/phase1-migration.js --inspect` from the repository root. Exit 0, `blocked: []`, `steps: []`, uniqueAlreadyExists true, and all anomaly findings empty. The inspection-only banner says MIGRATION EXECUTED: NO for that read-only invocation; the preceding single --apply invocation completed the recovery successfully.

**9. Phase 1 and Phase 2 tests**

From Bank-backend:

```text
node --test --test-isolation=none scripts/phase1-migration.test.js scripts/phase1-security.test.js scripts/phase2-reports.test.js
```

Exit 0: **60 passed, zero failed** (11 migration, 4 Phase 1 security, 45 Phase 2 tests). Tests use isolated/mock database behavior. No live reports were created, changed or deleted.

**10. Backend syntax**

Ran node --check on all 34 backend JavaScript files, excluding node_modules. All passed. Exact PowerShell sweep:

```powershell
$files = @(rg --files Bank-backend -g '*.js' -g '!node_modules')
foreach ($file in $files) {
    node --check $file
    if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $file" }
}
```

**11. Frontend build**

Ran npm run build from frontend. The sandbox blocked esbuild's subprocess with EPERM; the approved outside-sandbox retry exited 0. Vite built 117 modules in 5.10 seconds. Existing chunk-size warning remains: JavaScript bundle 516.47 kB (168.26 kB gzip). No frontend source changed.

**12. Diff verification**

git diff --check passed. Git emitted only normal LF/CRLF conversion notices for existing modified files.

**13. Files changed / artifacts**

Changed during this recovery:

- Bank-backend/scripts/phase1-migration.js — deterministic unused FK name and collision guard.
- Bank-backend/scripts/phase1-migration.test.js — three isolated recovery/idempotency/collision tests and fixture support.
- MIGRATION_EXECUTION_REVIEW.md — add a completion notice linking to this report; preserve original failure history.
- MIGRATION_RECOVERY_REVIEW.md — this report.

Preserved from the previous run: .gitignore backup exclusion, migration blocked-apply safety guard/completion logging and its test.

Ignored local verification artifacts: .database-backups/phase1-20260919/recovery-inspect.cjs, recovery-before.json and recovery-after.json. The original database-before.sql backup was not restored or modified. Verified its original size (35,004 bytes) and SHA-256 still match backup-proof.json. No credential file was created during recovery, and .env was not modified or printed.

**14. Remaining risks**

No migration steps remain. Application tests are isolated rather than live mutating integration tests; no restore drill was performed. The original backup remains private data and should remain outside Git. The existing frontend bundle-size warning remains. Broader Phase 2 deferred issues and future lifecycle workflows were not addressed by this migration-only task.

**15. Git status / stop**

Expected final status: modified .gitignore, phase1-migration.js and phase1-migration.test.js; untracked MIGRATION_EXECUTION_REVIEW.md and MIGRATION_RECOVERY_REVIEW.md. Backup and verification artifacts are ignored. No application files changed, and no commit, push, branch switch, merge, rebase or reset was performed.

PHASE 1 MIGRATION COMPLETE: YES

DATA ROWS CHANGED: NO

COMMITTED: NO

PUSHED: NO

Stopped after migration verification. Phase 3 was not started.
