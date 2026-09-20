# Phase 4A review

PHASE 4A IMPLEMENTED: YES  
ANALYTICS OVERCOUNT FIXED: YES  
LIVE BUSINESS DATA MUTATED BY TESTS: NO  
COMMITTED: NO  
PUSHED: NO

## Git preflight and inspection

`git status --short` was empty before implementation. HEAD was `9c42cb2 add audited report finalization and correction workflow`, the committed Phase 3B checkpoint. The preceding commits were `344a471`, `80082a0`, `7570fcb`, and `a10d727`. No inherited dirty work needed handling.

Inspected the report/audit services, business controller/routes and analytics SQL, branch usage, prior test suites and shared fixture, central reports component, Head Office navigation in AdminDashboard, business analytics component, business-date helper, and API utility. The employee/task report queries are separate legacy metrics and were not changed.

Read-only live schema inspection confirmed:

- `branches` includes `branch_id`, `branch_code`, `branch_name`, `branch_district`, and `is_active TINYINT(1) DEFAULT 1`.
- Report headers retain `UNIQUE(branch_id, entry_date)`, decimal amounts, item-count totals, lifecycle, pending-request flag, and submission timestamp.
- Items reference report headers and contain account type and item amount.
- There are 38 branch records. A separate read-only execution of the new overview query returned 38 distinct active branch rows.

## Files changed

| File | Change |
| --- | --- |
| `Bank-backend/services/business-report.service.js` | HEAD_OFFICE-only daily overview query, derived statuses, reconciled summary and exact header totals |
| `Bank-backend/controllers/business.controller.js` | Overview handler; fixed all-time analytics report/item aggregation |
| `Bank-backend/routes/business.routes.js` | Explicit Head Office overview route |
| `Bank-backend/scripts/helpers/report-fixture.js` | Existing analytics mock recognizes corrected query; previous test assertions unchanged |
| `Bank-backend/scripts/phase4a-overview.test.js` | 40 new isolated tests, including execution of real read SQL against in-memory relational fixtures |
| `frontend/src/components/AdminBusinessReports.jsx` | Head Office overview integration, request ordering, loading/error reconciliation, reuse of existing report detail/actions |
| `frontend/src/components/DailyOperationsOverview.jsx` | Presentation component within the existing reporting page: date controls, summary, branch table |
| `frontend/src/components/AdminBusinessReports.css` | Small layout additions and text-labelled status styling |
| `frontend/src/utils/businessDate.js` | Calendar-safe previous/next-day arithmetic |
| `frontend/src/utils/businessAmount.js` | Exact decimal-string currency formatting for large aggregate amounts |
| `PHASE4A_REVIEW.md` | This review |

## Endpoint, authorization, and date semantics

`GET /api/business/head-office/daily-overview?date=YYYY-MM-DD`

The route requires existing JWT verification and HEAD_OFFICE authorization. The service independently enforces the Head Office role. MANAGER, EMPLOYEE, and ADMIN receive 403; unauthenticated requests are denied by existing middleware. Existing ADMIN access to legacy central-read routes remains unchanged.

Omitted date defaults to today in Asia/Kolkata using the existing `businessToday` helper. Explicit dates use existing strict real-calendar validation, including leap years and the supported 1000–9999 year range. Malformed values, arrays/objects, and impossible dates return 400. The date is bound as a query parameter. Client branch fields cannot scope this all-branch endpoint.

## Branch rows and summary

One set-based query begins with `branches`, applies its actual `is_active = 1` flag, and LEFT JOINs report headers with the selected date in the join condition. Inactive or null-active branches are excluded; there is no invented branch-type/district rule. The unique branch/date constraint ensures at most one matching report. There is no item join, N+1 lookup, or report creation.

Each row contains only branch ID/code/name/district, report ID or null, selected date, canonical lifecycle/display status, normalized numeric pending flag, header amount/count, and submission timestamp. User/manager internals and correction reasons are not included in this overview. Submission timestamps are formatted as database calendar strings without browser timestamp conversion.

| Persisted condition | Display status |
| --- | --- |
| No matching header | NOT_STARTED |
| DRAFT | DRAFT |
| SUBMITTED, pending flag 0 | SUBMITTED |
| SUBMITTED, pending flag 1 | CORRECTION_PENDING |
| FINAL_LOCKED | FINAL_LOCKED |
| Existing header with unknown/null/empty status | UNKNOWN |

Historical lowercase/whitespace lifecycle values normalize on read. Unknown lifecycle values are exposed as UNKNOWN rather than arbitrary stored text. NOT_STARTED rows have null report ID/lifecycle/submission time and zero amount/count/flag. Operational display statuses are never persisted.

The response is `{ date, branches, summary }`. Summary is reduced directly from the same branch rows and includes:

- `totalBranches`, `notStarted`, `draft`, `submitted`, `correctionPending`, `finalLocked`, `unknown`.
- `reportedBranches`: existing report headers, including drafts and unknown states.
- `totalAmount`: exact sum of report header amounts.
- `totalEntries`: sum of report header item counts, not the number of reports.

Status buckets are mutually exclusive and sum to `totalBranches`. Amount/item totals include every existing report in the selected active-branch/date result, regardless of lifecycle. This represents entered daily data, not only approved/submitted business. Draft and correction-pending data is deliberately included and labelled in the UI. No-report branches contribute zero.

Money is accumulated in integer cents and returned as decimal strings, preserving precision above JavaScript's safe integer range. The new overview formatter preserves those cents in the browser too. No header amount is duplicated by item count.

## Analytics bug and correction

The prior `/api/business/reports` overview ran `SUM(e.total_amount)` over report headers LEFT JOINed to items. Each header was repeated for each item, so a 100 report with two items plus a 100 report with three items incorrectly summed to 500.

The corrected query aggregates headers alone and uses an independent scalar item-count subquery:

| Metric | Grain and calculation |
| --- | --- |
| `totalBusiness` | Header grain: `COALESCE(SUM(e.total_amount), 0)` without item join |
| `totalReports` | Header grain: `COUNT(*)` |
| `reportedBranches` | Header grain: distinct header branch IDs |
| `totalAccountsOpened` | Item grain: independent item table count; legacy response name retained |
| Account-type breakdown count/amount | Item grain: existing grouped item query retained |

No `SUM(DISTINCT amount)` workaround is used. Equal-valued legitimate reports both contribute. Headers without items still contribute once. Empty aggregates return zeros.

Existing analytics scope remains all-time/all-branch/all-lifecycle, matching the current analytics screen; the route had no implemented date or branch filters. New daily overview scope is independently explicit. The existing legacy all-branches summary already sums headers without an item join, so its submitted/final-locked date filter was preserved. Detail joins do not aggregate header amounts and were not part of the overcount defect. No legacy employee/task metrics were refactored.

## Frontend behavior

Head Office uses the new endpoint within the existing central reporting page and navigation. ADMIN retains the legacy overview. No second dashboard route was introduced.

The page shows the selected India business date, previous/next-day controls, a date picker, Refresh, seven status-count cards including UNKNOWN, report count, exact entered amount, and item count. Every active branch appears with its name/code/district, textual status, totals, submitted time, and report action. Status text accompanies colors. NOT_STARTED has “No report” and no report action.

View Report reuses the existing report detail screen. Pending requests lead to Phase 3B approval/rejection; submitted reports lead to Phase 3A final locking. No new lifecycle operations were introduced. Detail headings use the report's actual date, including when opened from history.

Overview requests use a monotonically increasing version so older responses cannot replace newer ones. Effect cleanup invalidates outstanding requests. Rendered data must match the selected date; prior-date cards/table are hidden during loading or failure. Errors clear old data and offer Refresh. An empty valid branch result displays an explicit no-active-branches message.

Detail requests also ignore older completions and clear stale content while loading. Back invalidates pending detail responses and refreshes the overview. Loading/error screens prevent interaction with a stale detail report. Existing success/conflict reconciliation for correction and final-lock actions remains in use.

## Tests and verification

| Check | Result |
| --- | --- |
| Existing Phase 1/2/3A/3B tests | 175 passed |
| New Phase 4A tests | 40 passed |
| Combined suite | 215 passed, 0 failed |
| Full backend JavaScript syntax | 39 files passed |
| Frontend production build | Passed, 119 modules |
| Lint before | 10 errors, 1 warning |
| Lint after | 10 existing errors, 0 warnings; no new findings |
| `git diff --check` | Passed |

Combined command from `Bank-backend`:

```text
node --test --test-isolation=none scripts/phase1-migration.test.js scripts/phase1-security.test.js scripts/phase2-reports.test.js scripts/phase3a-milestones.test.js scripts/phase3b-corrections.test.js scripts/phase4a-overview.test.js
```

New tests cover role denials, default India date at UTC/India midnight boundaries, explicit/leap/invalid dates, all 38 rows, missing reports, normalized statuses, pending correction, UNKNOWN, exclusive buckets, report counts, header item totals, equal report amounts, precise large totals, active flags, selected-date filtering, lack of client branch scoping, one parameterized query, minimal response fields, empty/error states, and frontend calendar/currency helpers.

Analytics regression tests execute the actual controller SQL on disposable in-memory SQLite fixtures. The old SQL is also executed to demonstrate 500, followed by assertions that the corrected route returns 200, two reports, two reporting branches, and five items. Account-type item totals/counts, equal-valued reports, headers without items, empty datasets, and legacy analytics scope are verified. A small DATE_FORMAT adapter supplies the MySQL formatting expression for isolated overview tests. No existing test assertions were weakened; the shared mock's query matcher changed with the corrected SQL.

Node's built-in SQLite and mock-timer APIs may emit experimental warnings in this runtime. No database package or test dependency was installed. Vite initially encountered sandbox EPERM spawning esbuild; the approved build retry passed. The final JavaScript bundle is 524.99 kB and retains the existing over-500-kB warning. Existing lint errors are the frontend/hash.js `require` finding and declaration-order findings in three legacy dashboards. The central report effect dependency warning was resolved without changing lint rules.

## Live database activity and limitations

Live activity was strictly read-only: SHOW CREATE TABLE for branches/headers/items, SELECT branch count, and a separate direct read-only smoke check of the new overview service query. That query returned 38 unique active branches and reconciled status buckets for 2026-09-20. Its output was restricted to date/count/reconciliation metadata. Automated tests use only in-memory data and never connect to the live database.

No migrations, seeds, setup, resets, or live business mutations were run. No reports were manufactured for missing branches. Existing lifecycle/audit services and authentication architecture remain intact.

Browser end-to-end interaction and automated rendering/network-race tests were not run; date/request behavior was reviewed in code, helper tests passed, and the production build passed. In-memory SQL tests do not reproduce every MySQL-specific behavior, so the overview SELECT also received a separate read-only live syntax/result-shape check. The overview uses current active-branch flags for historical dates because there is no effective-dated branch-activity model. Existing timestamp storage conventions, JWT claim freshness, lint failures, and bundle warning remain.

Final Git state contains only the Phase 4A modified/new files listed above; all remain uncommitted. HEAD remains the Phase 3B checkpoint. No push or deployment was performed.

Deferred Phase 4B/later work: audit-history UI, broader analytics/dashboard redesign, and legacy cleanup. Reopening FINAL_LOCKED, direct Head Office editing, and arbitrary status changes were not added. Work stops after Phase 4A.
