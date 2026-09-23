# Phase 5C: Manager and Head Office UI/UX redesign

Implemented on 2026-09-21; scope corrected and reverified on 2026-09-22.

**PHASE 5C SCOPE: Manager + Head Office authenticated workspace redesign only.**

The public Login/front page remains the Phase 5B design. Orange bank branding applies to the authenticated redesign, not a redesign of Login. No backend business logic, authorization, authentication architecture, API contract, schema, or live business data was changed.

## Login restoration and CSS isolation

Restored `frontend/src/pages/Login.jsx`, `frontend/src/pages/Login.css`, `frontend/index.html` and `frontend/src/akola-theme.css` byte-for-byte from committed `0f6e8e9`. There are no remaining Login JSX/CSS differences, including labels, autocomplete, logo markup, layout, behavior or accessibility additions. The document title and favicon are also exactly Phase 5B. No nonvisual Login-file exception was needed.

The Phase 5C token/base rules moved into `operations.css`, scoped to `.workspace-shell`, `.workflow-dialog` and `.toast`. Typography, inputs, focus, placeholder and reduced-motion rules no longer restyle Login. The original global theme remains unchanged to preserve Phase 5B inheritance. The authenticated WorkspaceShell retains its bundled logo import; Login retains its original logo path.

One small compatibility stylesheet, `frontend/src/login-compat.css`, preserves the `.login-container h1` 1.75rem tablet rule at widths up to 768px. Phase 5B supplied that rule through the now-removed dashboard stylesheet. It preserves the old Login result without restoring or duplicating the large dashboard CSS. This is category D compatibility preservation, not an intentional visual redesign.

Separate headless-browser runs compared the committed Phase 5B frontend in a temporary directory with the corrected frontend. At 1440, 1024 and 768px, all Login element/pseudo-element computed styles had **zero differences**, and PNG screenshots were **byte-identical**. Animations/transitions were frozen identically in the test only for deterministic comparison; actual Login animation behavior is unchanged. Mocked sign-in through the restored form successfully routed to both workspaces. No real credentials or live backend were used.

## Preflight and baseline

`git status --short` was empty before editing. Phase 5B was committed at `0f6e8e9` (`harden authentication and production security`). The six initial commits were `0f6e8e9`, `62371a6`, `534f493`, `419f92d`, `9c42cb2`, `344a471`.

| Verification | Baseline | Final |
| --- | --- | --- |
| Complete backend suite, Phases 1–5B | 283 passed, 0 failed | 283 passed, 0 failed, 0 skipped |
| Backend JavaScript syntax | 28 files passed | 28 files passed |
| Frontend helper tests | No Phase 5C tests | 8 passed, 0 failed |
| Isolated headless browser checks | No Phase 5C checks | Passed with synthetic API responses |
| Frontend lint | 0 errors / 0 warnings | 0 errors / 0 warnings |
| Frontend production build | Passed; 111 modules | Passed; 118 modules |
| JavaScript | 308.47 kB / 98.82 kB gzip | 310.68 kB / 99.88 kB gzip |
| CSS | 30.98 kB / 6.62 kB gzip | 24.25 kB / 5.75 kB gzip |
| HTML | 0.46 kB / 0.29 kB gzip | 0.46 kB / 0.30 kB gzip |
| Bank logo build asset | Hardcoded runtime path | Existing 9.44 kB image bundled for authenticated shell; Login unchanged |
| `git diff --check` | Passed | Passed |

JavaScript grew by 2.21 kB (1.06 kB gzip); CSS fell by 6.73 kB (0.87 kB gzip). The restored Login stylesheet is included in these corrected final figures. No large chunk warning. No UI, icon, chart, font, browser-automation, or testing dependency was installed. Package manifests and lockfiles are unchanged. Builds/headless browser checks ran outside the sandbox because they require child processes. Ordinary syntax and isolated Node tests ran without live infrastructure. Git's LF/CRLF normalization notices are not whitespace errors.

## Inspection findings and design direction

Inspected App, Login, both dashboards, DynamicEntryTable, AdminBusinessReports, DailyOperationsOverview, AdminBusinessAnalytics, ReportAuditHistory, their styles, the shared theme, toast, business date/amount, audit and auth helpers, API interceptor, and existing test capabilities before editing.

Previous structure:

- Each dashboard owned a largely duplicated, wide orange sidebar, header, footer and logout flow. Head Office had both sidebar navigation and duplicate tabs. Notification buttons had no action.
- Dashboard styles included repeated global button/table rules and unused employee/task-era selectors. Component CSS repeatedly overrode these rules, with competing status colors and spacing.
- Manager status appeared mainly below the form; submitted/final reports rendered disabled inputs. Browser prompts/alerts interrupted correction and save flows. Date-load failures were only logged.
- Head Office gave seven status cards similar prominence, with totals beneath them and no branch search. Narrow table columns could become hard to scan.
- Analytics, audit history and other data views used inconsistent loading, empty, error and number presentation.

Authenticated-workspace direction: a restrained internal operations application, with a white top bar, compact neutral navigation, light neutral page background, flat bordered surfaces, dark text, modest radii, and orange only for active navigation, primary actions, focus and small brand details. System fonts remain. Login's original visual direction is intentionally preserved.

## Design tokens and shared components

`frontend/src/operations.css` defines the small authenticated-workspace token system. `akola-theme.css` is restored to Phase 5B:

| Area | Tokens / decisions |
| --- | --- |
| Brand | `--brand: #b94313`, hover `#92330d`, tint `#fff1e9`, warm brand border and visible orange focus |
| Neutral surfaces | Page `#f5f6f7`, white surface, secondary `#f8f9fa`, subtle and stronger borders |
| Text | Primary `#222a32`, secondary `#505d69`, muted `#626d77` |
| Semantic | Slate draft/not started; muted teal submitted; amber correction pending; green final locked; red unknown |
| Geometry | 6px base radius; 4/8/12/16/24/32px spacing tokens |
| Type | 24px page title, 17px section title, 14px body/table, smaller metadata; tabular numerals for financial values |

`operations.css` owns the shell, shared controls, tables, surfaces, feedback, dialogs, responsive breakpoints and safe text toast styling. Local component CSS now owns only local layout. Repeated Manager/Admin dashboard CSS files were removed after replacing their imports and consumers.

Shared components:

- `WorkspaceShell`: bank identity, current user/workspace, Manager branch context, compact navigation, logout, skip link and main region.
- `OperationsUI`: PageHeader, DateControls, StatusBadge, ReportState, SummaryMetric, LoadingState, InlineError and EmptyState.
- `WorkflowDialog` with `useDialog`: one native modal-dialog implementation for confirmations and required reasons.
- `operations.js`: presentation-only status mapping, branch filtering, reporting progress and dialog reason validation. It grants no authority and does not calculate business totals.

## Manager before/after

Manager now opens directly into branch context, “Daily business report,” grouped previous/date/next/refresh controls, report history, and a prominent friendly report status with the next-step explanation. The India business-date helper and the existing maximum of today are retained.

No report is explicitly “Not started,” with a short instruction and the first editable row ready. Draft remains editable; reopened Draft uses the same interface. Submitted, correction-pending and final-locked reports use plain read-only table cells instead of disabled inputs. Unknown/unavailable states never look editable.

Entry improvements:

- Clear account type, activity, amount and remark columns; one shared account-type datalist instead of duplicate IDs.
- Labels identify every row input; numeric columns align right with tabular numerals. Read-only amounts use the existing exact-decimal formatting helper.
- Add row stays below the table. Remove is a separate, named destructive row action. Last-row removal and report deletion retain their existing effects, with explicit confirmations.
- The existing client total calculation and save/submit payloads are retained. Totals stay visible in a neutral footer. Server totals remain authoritative.
- Save draft is secondary; Submit report is orange and explains that submission locks editing. Submission now has an intentional confirmation rather than implying it is a Head Office final lock.
- Validation is an inline alert listing affected rows. Successful saves use the existing safe text toast system rather than blocking browser alerts.
- Report load/history failures have distinct retry states. Request version checks prevent superseded responses from replacing a newer date's report. A failed report load blocks editing until refresh succeeds.

Correction requests require a trimmed 1–1,000 Unicode-code-point reason in a labeled dialog. Pending reports display the requested reason safely and explain that Head Office must act. Submitted reports remain locked; approved corrections reopen the existing Draft workflow; final locked reports expose no editing/correction action.

## Head Office before/after

Navigation now clearly separates Daily operations from Business analytics. No duplicate top tabs or unsupported notification action remain. The existing tab/component architecture is retained; no new routes or APIs were added.

Daily operations groups selected-date navigation, picker and refresh in its header. The primary summary is now:

1. Reports entered / active branches, with exact numbers and an accessible native progress indicator. This includes existing drafts, matching the API's `reportedBranches` semantics.
2. Needs attention: correction pending plus unknown, with both component counts explicitly shown. Not-started and draft counts remain in the status filters.
3. Finalized: final-locked count.
4. Entered amount and item count, clearly tied to the selected date.

All existing status counts remain visible. Unknown is always filterable and receives an additional visible review notice when nonzero. Totals explicitly include drafts and pending corrections; filters do not recalculate or alter the overall summary.

The branch register has stronger branch names, secondary code/district metadata, readable status labels, right-aligned amounts/counts, submission time, and a clear report action. Not-started rows show “No report,” with no invented entry or action. Pending rows have a subtle attention marker as well as text. Headers stay visible inside the bounded scroll region.

Search is client-side, case-insensitive and trimmed, matching branch name/code. It intersects All / Not started / Draft / Submitted / Correction pending / Final locked / Unknown filters. Counts, “Showing X of Y,” clear filters and an explicit no-match state make the result understandable. Filtering preserves API ordering/data and has no backend endpoint or persistence. It resets when the overview component is remounted.

Report detail keeps branch/date/Manager/report context above the read-only entries and total. Pending-correction decisions occupy a dedicated section with the requested reason visible. Approve and Reject are distinct; rejection asks for a Head Office decision note. Final lock has a serious but non-alarming orange confirmation. It remains unavailable while correction is pending. Existing eligibility guards, API calls and stale-conflict reconciliation are retained.

The transitional ADMIN read-only branch view, district filters, overview calculations, branch history and analytics remain. Unreachable central-edit form code previously guarded by `canEditReports = false` was removed; no enabled central editing capability was removed or introduced.

## Dialogs, audit, analytics and feedback

Workflow-critical browser prompts/confirms/alerts were replaced with reusable native `<dialog>` interactions for correction request, approval, rejection, final lock, submission, row removal and draft deletion. Each dialog has a title, description, explicit cancel/confirm labels and optional reason field/count/error. Cancel receives initial focus; Escape cancels; native modal behavior keeps background content inert and contains focus. Focus returns to the initiating control when it remains present. The isolated browser check verifies cancellation and focus restoration. No outside-click dismissal silently discards a reason. Logout directly clears the unchanged session helper and navigates to login.

Audit history uses a compact timeline with event, actor, transition, database-local India timestamp and separate requested reason / decision note blocks. API ordering and helper semantics are unchanged; no events are inferred from the current status. Reasons remain React text, including hostile-looking synthetic text tested in the browser. Loading/error/retry/no-events states share the common presentation.

Analytics retains the existing all-time endpoint, totals and top-ten breakdown. Labels clarify that it is independent of the selected daily-operations date. Amounts use Indian grouping and the existing exact-cent formatter; no chart library or new analytic calculation was added. Retry/refresh and no-breakdown states are explicit.

Loading, legitimate absence, filter no-match, and request errors now have distinct components. Context such as branch/date stays visible during loading/failure. Raw server/SQL errors are not introduced. Toasts retain text-node rendering and now carry status/alert roles. There is no broad session/auth change.

## Responsive and accessibility review

- Desktop uses a 210px neutral sidebar and four primary summary cells; smaller laptops use a 176px sidebar and two-column summary.
- At 800px and below navigation becomes a visible horizontal bar rather than disappearing. Date/actions wrap; summary cells stack into two columns. Phone headers wrap user context below bank identity.
- Tables retain readable minimum widths and scroll within named keyboard-focusable regions. The branch register does not compress branch names into individual letters. Financial columns are not converted into tiny mobile cards.
- Verified no page-level horizontal overflow at 1440, 1024, 768 and 390 pixels in isolated Edge. Initial tablet overflow from an absolutely positioned hidden header label was corrected by containing it in the table scroll region. Row-action wrapping was also corrected.
- Semantic buttons, associated date/search/reason/input labels, column scopes, visible focus outlines, `aria-current`, `aria-pressed`, live status/error regions and a skip link are provided. Meaning is never color alone.
- Measured text contrast: brand/white 5.42:1; secondary/white 6.75:1; muted/white 5.29:1; submitted/status surface 6.65:1; pending 6.32:1; final 6.60:1; unknown 6.68:1. These measurements cover the named pairs, not a formal complete accessibility certification.
- Reduced-motion settings suppress authenticated-workspace transitions/animations only. System fonts and the existing bank image are reused. The authenticated shell's logo import emits a production asset. Login logo markup, browser title/favicon and Login animation behavior remain Phase 5B.

## Files changed / scope classification

Every remaining Phase 5C frontend change is classified below: A = Manager workspace; B = Head Office workspace (including retained central-reader compatibility); C = shared authenticated-workspace UI; D = front/login compatibility; E = tests/review.

| File(s), relative to frontend | Class | Purpose |
| --- | --- | --- |
| `src/pages/ManagerDashboard.jsx` | A | Manager composition and branch context |
| Deleted `src/pages/ManagerDashboard.css` | A | Replaced duplicated Manager styling |
| `src/components/DynamicEntryTable.jsx`, `.css` | A | Manager entry, status, actions and history |
| `src/pages/AdminDashboard.jsx` | B | Central workspace navigation |
| Deleted `src/pages/AdminDashboard.css` | B | Replaced duplicated central dashboard styling |
| `src/components/AdminBusinessReports.jsx`, `.css` | B | Register/detail/correction/final-lock presentation |
| `src/components/DailyOperationsOverview.jsx` | B | Date summary, branch search/filtering |
| `src/components/AdminBusinessAnalytics.jsx` | B | Existing analytics presentation |
| `src/main.jsx` | C | Load scoped operations styles and the small legacy Login compatibility rule |
| New `src/operations.css` | C | Scoped tokens, typography, controls and shell styles |
| New `src/components/WorkspaceShell.jsx` | C | Authenticated shell and bundled shell logo |
| New `src/components/OperationsUI.jsx` | C | Header/date/status/feedback/summary primitives |
| New `src/components/WorkflowDialog.jsx` | C | Authenticated workflow dialogs |
| New `src/utils/useDialog.js` | C | Shared dialog context |
| New `src/utils/operations.js` | C | Presentation/filter/progress/reason helpers |
| `src/components/ReportAuditHistory.jsx`, `.css` | C | Shared audit timeline presentation |
| `src/utils/toast.js` | C | Accessible authenticated-workflow toast role |
| New `src/login-compat.css` | D | Preserve the old tablet heading rule after dashboard CSS removal; no redesign |
| New `scripts/operations.test.mjs` | E | Eight isolated UI helper tests |
| New `scripts/ui-smoke.mjs` | E | Login comparison capture, mocked sign-in and authenticated browser checks |
| `eslint.config.js` | E | Recommended Node lint rules for new test scripts |

`PHASE5C_REVIEW.md` is category E (review). Category D contains **no intentional visual redesign**. Login.jsx, Login.css, index.html and akola-theme.css have no source differences from Phase 5B and are excluded from the remaining changed-file list.

The scope-correction pass restored those four files; changed operations.css, main.jsx, ui-smoke.mjs and this review; and added login-compat.css. It did not revert any Manager or Head Office component.

Backend files/tests, API interceptor, ProtectedRoute, session helper, business date/amount/audit helpers, package manifests and lockfiles remain unchanged. No security/lint rules were disabled.

## Tests and browser evidence

Run from `Bank-backend`:

```powershell
$tests = @(rg --files scripts -g '*.test.js')
node --test --test-isolation=none @tests
```

Run from `frontend`:

```powershell
node --test --test-isolation=none scripts/operations.test.mjs
node scripts/ui-smoke.mjs
npm run lint
npm run build
```

The browser script uses locally installed Edge by default; `BROWSER_PATH` can point to another installed Chromium executable. It adds no test dependency. It starts its own local Vite instance and a hidden headless browser with a new temporary profile. It overrides the API base URL, intercepts every API request (including synthetic login), and blocks nonlocal traffic. Each run has a separate Vite cache. Optional UI_ROOT and LOGIN_ONLY environment values support capturing an isolated committed Login baseline. No live backend is started or contacted. Its synthetic state changes exist only in the script's memory. It closes its browser/server afterward and leaves synthetic screenshots in the printed temporary directory.

Eight helper tests cover state labels/pending derivation, exceptional unknown values, name/code search, combined status/search filtering, immutable source ordering/values, progress/zero branches, Unicode reason boundaries and exact financial formatting.

After scope correction, the passing browser run signed in through the restored Login form with synthetic API responses for both roles, then exercised Manager draft/add/remove/cancel, initial dialog focus and Escape/focus restoration, submission confirmation/read-only state, reason validation/correction request, failed load/retry, empty previous date/next date, reopened Draft and final-locked display. Head Office checks exercised 38 rows, search, no-match/clear, not-started/unknown filters, previous/next/picker dates, correction approval/rejection, unavailable final lock while pending, final-lock cancel/confirm, safe audit text, analytics, error/retry and logout. No browser runtime exception occurred. Relevant screenshots were visually reviewed, including desktop/tablet register, phone Manager, report detail and submission dialog.

Last passing corrected screenshot directory: `C:\Users\khush\AppData\Local\Temp\bank-phase5c-ui-jEIRJW`. Phase 5B reference screenshots: `C:\Users\khush\AppData\Local\Temp\bank-phase5c-ui-Borsos`. Login snapshots were byte-identical at all three comparison widths. Screenshots contain only synthetic branches, users, values and audit events. They are local temporary evidence, not committed product data or a deployed preview. Real-account login and a complete real-backend workflow were not performed by the agent.

## Manual browser checklist

Use existing reports for read-only checks. Use disposable development test reports for Save/Submit/correction/final-lock checks; final lock is irreversible. These are user follow-up checks, not live actions performed during this phase.

### Manager

1. Sign in with an existing Manager account; confirm role routing and bank identity.
2. Check the first screen clearly identifies branch name/code, selected business date and reporting task.
3. Confirm friendly status and explanation match the actual report.
4. Use previous/next/date picker/refresh; next remains unavailable beyond India today.
5. Open a date without a report; confirm Not started, helpful text and an initial entry row.
6. Open a Draft; confirm account types, activities, remarks and amounts load correctly.
7. Edit a row; verify labels, numeric alignment and keyboard focus.
8. Add/remove a row; cancel removal first. On a disposable saved Draft confirm removal preserves the existing immediate-save behavior. Check last-row and delete-draft confirmation wording.
9. Verify zero, decimal and large amounts display correctly and totals match existing calculations.
10. Save a disposable Draft, refresh and confirm persistence.
11. Try incomplete submission to inspect inline row validation; then inspect/cancel the submit confirmation. Submit a disposable complete report when appropriate.
12. Confirm Submitted has plain read-only rows and no editing controls.
13. Open Request correction; test cancel/Escape, empty reason, a valid reason and keyboard navigation.
14. After requesting correction, confirm pending explanation and safe requested-reason text; no second request action should appear.
15. After Head Office approval, refresh and confirm Draft editing and resubmission still work.
16. Open a final-locked report; confirm completion explanation and no edit/correction action.
17. Review audit chronology, actor, transition, timestamp and distinct requested reason/decision note.
18. Exercise loading, offline/error/retry and empty history where practical; errors must not present stale rows as editable.
19. Log out, log in again and refresh a valid session; invalid/expired tokens must retain the Phase 5B redirect behavior.
20. Tab through navigation, dates, inputs, row actions and dialogs; confirm visible focus, cancellation and return focus. Scroll the entry region by keyboard at narrow widths.

### Head Office

1. Sign in with an existing Head Office account; confirm Daily operations is the default workspace.
2. Confirm all 38 active branches appear in All when that is the actual configured network.
3. Check previous/next dates across month boundaries and that branch data belongs to the selected date.
4. Use the date picker; confirm selected-date context remains visible in the summary/register/detail.
5. Refresh and confirm feedback while loading; check failure/retry without interpreting old counts as current.
6. Verify the four primary summary elements and all secondary status counts against the API data.
7. Confirm progress counts reports entered, including Draft; it is not mislabeled as submitted progress.
8. Search by name/code, mixed case and no-match text; clear the search.
9. Combine search with each status filter; verify visible counts and clear filters.
10. Inspect Not started rows: no fake report action.
11. Inspect Draft rows and read-only detail.
12. Inspect Submitted rows and final-lock eligibility.
13. Inspect Correction pending rows, reason and decision controls; no final-lock action while pending.
14. Inspect Final locked rows/detail; no further action to change the report.
15. Use synthetic test data for Unknown if no real example exists; verify the notice, filter and exceptional label.
16. Open report detail and submission history; return to the selected-date overview.
17. Approve a disposable pending correction; verify the Manager sees reopened Draft after refresh.
18. Reject a disposable pending correction; test required decision note and separate note/reason timeline labels.
19. Inspect/cancel final-lock confirmation, then final lock only a disposable eligible report when ready; verify immutable state.
20. Review audit order/actors/transitions and India-local timestamps, including hostile-looking text rendered literally.
21. Open Analytics; confirm all-time labeling, exact grouped amounts, item counts, top-ten breakdown and refresh.
22. Check loading, empty, no-match, history failure and report-not-found states where practical.
23. Log out and log in again; verify no change to session behavior.
24. Check keyboard navigation, filter pressed states, table scrolling, visible focus and dialog behavior.

### Viewports

Check approximately 1440px, 1024px and 768px. Confirm clear branch/status/action scanning, wrapped date controls, visible navigation, contained horizontal table scrolling and readable amounts. At phone width (~390px), confirm controls remain reachable and the page itself does not overflow. Also check longer real branch names, large reports, 200% zoom and the organization's actual supported browser/screen-reader combination.

## Remaining limitations and stopping point

Automated browser checks use synthetic API fixtures, not actual authentication or database workflows; they complement the unchanged backend suite and the manual checklist. Visual inspection covered Edge screenshots; Safari/Firefox, screen readers and real-user acceptance remain manual. Native dialog support is required. Filters are not persisted across overview remounts. Long tables scroll horizontally on narrow displays by design. Existing draft totals/calculation precision, server authority and date/API semantics are unchanged. No new unsaved-change persistence mechanism was introduced.

Security remains Phase 5B's bearer/localStorage model with current-identity backend authorization, explicit production environment/CORS policy and login limiter. Frontend role metadata only affects presentation; backend enforcement remains authoritative.

No live database inspection, mutations, migrations, seeds or schema operations were run. Final Git state contains only unstaged Phase 5C frontend/test changes and this review; HEAD remains `0f6e8e9`. No commit, push, deployment or portfolio documentation was started. Work stops after Phase 5C.

LOGIN/FRONT PAGE VISUAL DESIGN CHANGED FROM PHASE 5B: NO  
MANAGER REDESIGN RETAINED: YES  
HEAD OFFICE REDESIGN RETAINED: YES  
PHASE 5C IMPLEMENTED: YES  
ORANGE BANK BRAND IDENTITY PRESERVED: YES  
MANAGER WORKFLOW SEMANTICS CHANGED: NO  
HEAD OFFICE WORKFLOW SEMANTICS CHANGED: NO  
BACKEND BUSINESS LOGIC CHANGED: NO  
SECURITY BEHAVIOR CHANGED: NO  
LIVE BUSINESS DATA MUTATED: NO  
DATABASE SCHEMA CHANGED: NO  
COMMITTED: NO  
PUSHED: NO
