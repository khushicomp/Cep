# Phase 5A — repository and legacy architecture cleanup

PHASE 5A IMPLEMENTED: YES  
CORE REPORTING BEHAVIOR CHANGED: NO  
LIVE BUSINESS DATA MUTATED: NO  
DATABASE TABLES DROPPED: NO  
COMMITTED: NO  
PUSHED: NO

## Preflight and baseline

The working tree was clean at `534f493 add report audit history timeline`. The six inspected commits were `534f493`, `419f92d`, `9c42cb2`, `344a471`, `80082a0`, and `7570fcb`. Phase 4B was committed before cleanup.

All requested baseline checks ran before source cleanup: 235 tests passed, 0 failed; all 40 backend JavaScript files passed syntax checks; frontend build passed; lint reported 10 errors and 0 warnings; `git diff --check` passed. The build initially encountered sandbox EPERM launching esbuild, then succeeded with the approved retry. Baseline bundle: 527.70 kB JavaScript, 172.42 kB gzip, with a size warning.

## Dependency inventory and product boundary

| Classification | Traced dependency/runtime path | Decision |
| --- | --- | --- |
| A — core product | server -> app -> auth routes -> auth controller -> users/branches + JWT | Keep login, credentials verification, token lifetime/claims/storage and database compatibility unchanged |
| A — core product | app -> business routes -> business controller -> report/audit services | Keep all lifecycle, branch isolation, totals, corrections, analytics, overview, history and audit behavior |
| A — core frontend | App -> ManagerDashboard -> DynamicEntryTable; App -> AdminDashboard -> AdminBusinessReports/AdminBusinessAnalytics | Keep core components; remove surrounding legacy tabs/state/API calls only |
| A — shared frontend | ProtectedRoute, API/session helpers, report date/amount/audit helpers, toast, report CSS, dashboard layout CSS | Keep shared behavior/styles; remove only unused getToken export |
| B — employee/task frontend | /employee -> EmployeeDashboard; legacy manager/admin tabs -> employee/task management, charts, user creation | Remove obsolete workflows; retain existing dashboard shells and business navigation |
| B — legacy backend | app -> /api/tasks, /api/reports, /api/users -> task/report/user controllers -> tasks/task_updates/users | Remove mounts, route/controller files, branchFilter middleware, unused role helpers |
| B — unused frontend chain | MyTasks -> taskService; standalone Sidebar -> /employee | No remaining core imports; remove |
| C — debug/destructive | check_db/test_db dumps; test_delete signs a synthetic privileged request; credential seeders; frontend hash utility; CSS patch script | Remove obsolete tools after inspecting imports/SQL/side effects |
| D — migration/schema history | scripts/phase1-migration.js + tests and migration reviews; schema.json | Keep legitimate hardening tool/tests/reviews and historical metadata |
| D — historical bootstrap | setup_branches.js, setup_db_business.js, migrations.js | Preserve schema/catalogue evidence, but block accidental execution/import before DB access; document hazards |
| E — initially uncertain | schema.json; chart/countup dependencies; shared-looking CSS | Schema is old column metadata, not user data; retain with caveat. Chart packages have only removed consumers; remove manifest/lock entries. Preserve shared layout/status CSS to avoid visual regressions |

Supported workspaces are MANAGER branch reporting and HEAD_OFFICE central review. Existing transitional ADMIN central business reads remain available; no new authority was granted. EMPLOYEE records and authentication compatibility remain, but no employee workspace or task API exists. Employee login receives an unsupported-workspace message instead of navigating to a removed page. Token issuance/storage/claims and password verification policy were not redesigned.

## Files deleted

23 first-party files were removed:

- Backend controllers: `controllers/task.controller.js`, `controllers/report.controller.js`, `controllers/user.controller.js`, `controllers/dbTest.controller.js`, `controllers/test.controllers.js`.
- Backend routes: `routes/task.routes.js`, `routes/report.routes.js`, `routes/user.routes.js`, `routes/dbTest.routes.js`, `routes/test.routes.js`.
- Backend middleware: `middleware/branch.middleware.js`, used only by removed task/user endpoints. Core branch isolation remains in business-report.service.js.
- Backend tools: `check_db.js`, `test_db.js`, `test_delete.js`, `seed_test_users.js`, `scripts/seed-all-users.js`.
- Frontend: `hash.js`, `src/pages/EmployeeDashboard.jsx`, `src/pages/EmployeeDashboard.css`, `src/pages/MyTasks.jsx`, `src/pages/patch_employee_css.py`, `src/components/Sidebar.jsx`, `src/services/taskService.js`.

Separately, 1,151 backend node_modules paths were removed from the Git index only. Their local files were not physically deleted.

## Files modified/added

- `.gitignore`: preserve existing dependency/env/backup/build/log rules; add root OS/editor noise rules.
- `Bank-backend/app.js`: remove legacy route mounts; update obsolete task-monitoring health text to branch reporting.
- `Bank-backend/server.js`: remove redundant unused database import.
- `Bank-backend/middleware/auth.middleware.js`: remove unused legacy isAdmin/isAdminOrManager exports; JWT verification unchanged.
- `Bank-backend/migrations.js`, `setup_branches.js`, `setup_db_business.js`: add explicit historical-utility gate before any module/environment/database access.
- `Bank-backend/scripts/phase1-security.test.js`: retain core error-disclosure assertions; remove iterations for intentionally deleted task/report/user/debug controllers.
- `Bank-backend/scripts/phase5a-cleanup.test.js`: add three focused cleanup regression checks.
- `Bank-backend/DATABASE_UTILITIES.md`: utility decisions, safeguards, and reproduction limitations.
- `frontend/src/pages/ManagerDashboard.jsx`: remove task/employee state, requests, assignment/creation views and charts; keep existing shell and DynamicEntryTable.
- `frontend/src/pages/AdminDashboard.jsx`: remove employee/task analytics and user creation; keep report/analytics navigation and existing shell.
- `frontend/src/App.jsx`: remove employee route; unknown paths return to login.
- `frontend/src/pages/Login.jsx`: no navigation into obsolete employee workspace; supported role destinations unchanged.
- `frontend/src/utils/auth.js`: remove unused getToken helper; clearSession unchanged.
- `frontend/package.json`, `frontend/package-lock.json`: remove chart.js, react-chartjs-2, react-countup and their exclusive @kurkle/color/countup.js dependencies.
- `frontend/README.md`: replace stale starter-template prose with concise current development/product notes, not a portfolio/deployment README.
- `PHASE5A_REVIEW.md`: this review.

No core business controller/service/routes or report-detail components were modified. Existing npm commands were inspected: none invoked obsolete scripts, so none needed removal.

## Runtime endpoints and navigation removed

Removed all `/api/tasks` routes: POST `/assign`, GET `/my-tasks`, PUT `/update/:taskId`, GET `/recent`.

Removed all legacy `/api/reports` routes: GET `/employee`, `/branch`, `/weekly-trend`, `/all-branches`, `/branch-employees`, `/admin/monthly`. These were task-performance metrics, distinct from retained `/api/business/reports` business analytics. The unmounted monthly-task helper was removed with its controller.

Removed `/api/users/create` and `/api/users/employees`. The user-creation form was part of the obsolete manager/admin employee-management workspace and used shared default credentials. Authentication still reads the users table; existing users are untouched. No replacement account-provisioning feature was added.

Previously unmounted debug/test route modules were removed. App now mounts only `/api/auth` and `/api/business`; removed API paths fall through to Express's normal 404 handling.

Removed `/employee`, employee task completion/performance, manager task assignment/recent-task charts, employee creation/listing, and the admin Employee Tasks/user-creation panel. Managers open the existing daily report component directly. Head Office opens existing daily reports/analytics tabs. Shared CSS used by reporting/history was preserved rather than indiscriminately deleted.

## Development and schema utilities

| Utility | Classification | Result |
| --- | --- | --- |
| scripts/phase1-migration.js + tests | KEEP | Existing inspection/apply safeguards and schema-hardening history unchanged |
| schema.json | KEEP/DOCUMENT | Historical SHOW/DESCRIBE metadata only; not current authoritative schema or a full bootstrap |
| setup_branches.js | RESTRICT/DOCUMENT | Contains destructive branch recreation and original catalogue; retained, explicit direct-execution opt-in required |
| setup_db_business.js | RESTRICT/DOCUMENT | Original business table definitions retained behind same gate |
| migrations.js | RESTRICT/DOCUMENT | Historical users/tasks/report DDL and sync updates retained behind same gate |
| scripts/seed-all-users.js | REMOVE | User deletion/recreation, demo identities and shared seeded credentials |
| seed_test_users.js | REMOVE | Demo credential insertion |
| check_db.js, test_db.js | REMOVE | Ad hoc live business/user data inspection and dumps |
| test_delete.js | REMOVE | Synthetic-token live deletion probe outside normal workflow |
| frontend/hash.js | REMOVE | Hardcoded password hashing utility, also source of a lint error |
| patch_employee_css.py | REMOVE | One-off patcher for deleted employee stylesheet |

Retained historical utilities reject execution/import before loading dotenv or database modules unless directly invoked with `--allow-historical-schema-write`. This is an accidental-execution guard, not authorization to run them on live data. Their original destructive code remains for historical inspection; documentation explicitly limits any future reviewed use to isolated databases. No setup, seed, migration apply, or reset tool was executed.

## Repository and credential hygiene

Baseline tracked files: 1,246, including 1,151 node_modules files and 95 first-party files. After index cleanup, Git's index has 95 paths because the 23 first-party deletions remain unstaged. Accounting for those deletions and three new source/review files, the intended final repository has 75 files. No local dependency installation was removed; backend mysql2 and frontend React remain present.

`git rm -r --cached --quiet -- Bank-backend/node_modules` was used exactly for index-only removal. The initial sandbox denied index.lock access; the authorized escalation succeeded. Only those dependency removals are staged. Source modifications, first-party deletions, and new files remain unstaged/untracked for review. No unrelated generated files were staged.

Verified ignore coverage for both node_modules directories, frontend dist, backend .env path, and database backups. Existing root rules already covered env variants, key material, logs, dependencies, output, and `.database-backups`; added `.DS_Store`, `Thumbs.db`, and `.idea/` only.

Inspected current tracked first-party files for hardcoded password/JWT/DB credential candidates and sensitive logs without printing values or reading local .env contents. Findings removed:

- `Bank-backend/controllers/user.controller.js:25`: shared default password provisioning.
- `Bank-backend/scripts/seed-all-users.js:75`: seeded shared credential.
- `Bank-backend/seed_test_users.js:16`: demo password hashing input.
- `frontend/hash.js:3`: hardcoded hashing input.
- Legacy dashboard responses surfaced generated/default credentials; those workflows were removed.

Follow-up current-source scan found only deliberate synthetic fixture/test values in the report fixture and security/Phase 3/4 tests. These are isolated test data, not deployment credentials. Runtime database/JWT configuration remains environment-based. No secret values were printed in this review; no Git-history search/rewrite or credential rotation was attempted.

The dependency removal command using npm's offline lockfile mode failed because an unrelated optional Tailwind archive was not cached. Instead, the three verified unused direct dependencies and two exclusive transitive lock records were removed precisely, leaving all other versions/integrities unchanged. Manifest/lock declarations match and no remaining dependency references those five packages. No fresh npm ci was run, since it would replace the developer's installation.

## Verification before/after

| Check | Before | After |
| --- | --- | --- |
| Tests | 235 pass, 0 fail | 238 pass, 0 fail |
| Backend syntax | 40 files pass | 25 remaining files pass |
| Frontend lint | 10 errors, 0 warnings | 0 errors, 0 warnings |
| Production build | Pass, 122 modules | Pass, 111 modules |
| JavaScript bundle | 527.70 kB / 172.42 kB gzip | 308.47 kB / 98.82 kB gzip |
| Bundle size warning | Present | Gone |
| Tracked node_modules | 1,151 files | 0 files |
| git diff --check | Pass | Pass for working and staged changes |

The full Phase 1–4B suite still passes. One Phase 1 test previously looped over five controller types: four deleted legacy/debug subcases were retired, while all core business safe-error assertions and login/JWT/toast security tests remain. Test count stays 235 before adding three new cleanup tests. No core report assertions were weakened.

New tests verify only auth/business API mounts with core routes retained, no obsolete employee/task routes/API navigation in current dashboards, and historical setup guards that reject before module/database access. The guard checks use an isolated VM with a require stub; they do not execute the underlying setup code.

The tested suite command includes every `scripts/phase*.test.js` file with `node --test --test-isolation=none`. Backend files were checked with node --check. Frontend lint rules were unchanged; deleting obsolete dashboards/hash code and their unused declarations naturally removed all ten errors. Core shared components continue building successfully.

## Live database and retained compatibility

No live database inspection or mutation was needed in Phase 5A. Tests used existing synthetic/in-memory fixtures. No tables, users, roles, reports, items, audit rows, or branch data were changed. No migrations were executed.

Historical schema metadata names `tasks`, `task_updates`, and `time_logs`; those legacy tables are deliberately left in the database for a later controlled schema decision. `users`, `branches`, reports/items, and audit tables remain required. Legacy EMPLOYEE/ADMIN enum values, existing users, permission columns, and audit actor compatibility remain. No bulk role/user cleanup occurred.

## Read-only manual browser checklist

For MANAGER:

- Log in with an existing account; confirm the daily business reporting page loads.
- Open an existing report/date and view the audit timeline.
- Confirm correction controls/pending notices appear appropriately; do not submit a request merely for this cleanup check.
- Confirm no employee creation, task assignment, completion, or performance navigation remains.

For HEAD_OFFICE:

- Log in; confirm the selected-date 38-branch overview loads.
- Open an existing report and its audit timeline.
- Open business analytics and return to reports.
- Check appropriate correction/final-lock controls are visible without executing them.
- Confirm no employee/task navigation remains.

For compatibility, an existing EMPLOYEE login should stay on the login screen with an unsupported-workspace message; the old /employee URL redirects to login. No employee user deletion is needed.

## Remaining risks and Phase 5B recommendations

Browser checks above were not executed by the agent. Shared dashboard CSS retains some legacy selectors to avoid changing reporting/history appearance. Historical utilities still contain destructive SQL behind explicit gates and must not be treated as a safe fresh-environment installer. Complete schema bootstrap and controlled account provisioning remain separate work.

Current-source removal does not remove old credentials from Git history or invalidate accounts previously seeded with them. Phase 5B should assess credential rotation and any history remediation separately. JWT storage/claims, password policy, rate limiting, session revocation, and deployment controls were deliberately unchanged. Plan their review/hardening in Phase 5B; none was implemented here.

Final Git state is intentionally dirty for review: 1,151 staged index-only dependency deletions, unstaged cleanup source changes/deletions, and the three new files. HEAD remains 534f493. No commit, push, or deployment was performed. Work stops after Phase 5A.
