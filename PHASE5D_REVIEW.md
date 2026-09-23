# Phase 5D: Branch account provisioning and secure password lifecycle

Implemented for review on 2026-09-23. **Current status: implementation, development database migration, runtime verification and temporary-user cleanup are complete. Final pre-commit verification passed.** See the final verification, runtime and migration sections for current evidence. Earlier implementation-review sections and unsuccessful runtime attempts are historical checkpoints. The user has authorized the local Phase 5D commit; real-account provisioning, real mail, deployment, business-data cleanup and push remain deferred.

## Final pre-commit verification

Verified 2026-09-23 before the authorized local commit `add secure branch account credential lifecycle`:

- Live read-only check: users 59/60 and their temporary email identities are absent; total users = **58**. Every original table's full-row canonical fingerprint matches the saved baseline, including **8 reports, 8 items and 1 report-audit row**.
- Process/listener check: **0** Node/backend/frontend/helper processes and **0** development application listeners. No runtime was started during this final verification.
- Complete backend suite: **337 passed, 0 failed, 0 skipped**. Backend syntax: **40 JS files passed**.
- Frontend credential/operations tests: **11 passed**. Lint passed with no errors/warnings. Production build passed, **122 modules**.
- Complete candidate-file/diff review found no live secrets, encoded JWTs, persisted password hashes, environment contents, backups, temporary runtime artifacts, screenshots, build output or node_modules to commit. Credential literals in test fixtures are synthetic; `.env.example` contains only blank secret placeholders and example configuration. All 32 candidate files were scanned, including untracked files, with local secret comparisons performed privately.
- `.database-backups/` remains ignored. `git diff --check` passed. No application behavior changed during final verification. No migration, provisioning, mail, report cleanup, deployment or push was performed.

Only the following 32 Phase 5D files are included in the authorized local commit; historical `COMMITTED: NO` markers later in this document describe their earlier execution checkpoints.

```text
Bank-backend/.env.example
Bank-backend/DATABASE_UTILITIES.md
Bank-backend/config/credentials.js
Bank-backend/controllers/auth.controller.js
Bank-backend/controllers/business.controller.js
Bank-backend/controllers/credential.controller.js
Bank-backend/middleware/auth.middleware.js
Bank-backend/routes/auth.routes.js
Bank-backend/scripts/branch-account.js
Bank-backend/scripts/helpers/credential-fixture.js
Bank-backend/scripts/helpers/report-fixture.js
Bank-backend/scripts/phase1-security.test.js
Bank-backend/scripts/phase5b-security.test.js
Bank-backend/scripts/phase5d-credentials.test.js
Bank-backend/scripts/phase5d-migration.js
Bank-backend/scripts/phase5d-migration.test.js
Bank-backend/services/account-provisioning.service.js
Bank-backend/services/account-security.service.js
Bank-backend/services/credential-mail.service.js
Bank-backend/services/credential-policy.js
Bank-backend/services/credential.service.js
frontend/scripts/credentials.test.mjs
frontend/scripts/ui-smoke.mjs
frontend/src/App.jsx
frontend/src/components/AdminBusinessReports.jsx
frontend/src/pages/CredentialRecovery.css
frontend/src/pages/CredentialRecovery.jsx
frontend/src/pages/Login.jsx
frontend/src/services/recoveryApi.js
frontend/src/utils/credentials.js
PHASE5D_ACCOUNT_MODEL_ASSESSMENT.md
PHASE5D_REVIEW.md
```

## Preflight and baseline

HEAD: `cbf65ef redesign manager and head office workspaces`.

`git status --short` initially contained only `?? PHASE5D_ACCOUNT_MODEL_ASSESSMENT.md`, the expected assessment created in the preceding task. No unexpected application changes were present. That assessment was preserved; its recommendation is historical and superseded by the user's final operational-account decision below.

The eight most recent commits were `cbf65ef`, `0f6e8e9`, `62371a6`, `534f493`, `419f92d`, `9c42cb2`, `344a471`, `80082a0`.

| Check | Before implementation | After implementation |
| --- | --- | --- |
| Complete backend test suite | 283 passed, 0 failed, 0 skipped | 337 passed, 0 failed, 0 skipped |
| Backend JS syntax | 28 files passed | 40 files passed |
| Phase 5C frontend helpers | 8 passed | All 8 retained and passed |
| Additional frontend credential helpers | Not present | 3 passed; 11 total |
| Frontend lint | 0 errors/warnings | 0 errors/warnings |
| Production build | 118 modules | 122 modules |
| JS / gzip | 310.68 / 99.88 kB | 315.13 / 101.29 kB |
| CSS / gzip | 24.25 / 5.75 kB | 25.10 / 5.93 kB |
| HTML / gzip | 0.46 / 0.30 kB | 0.46 / 0.29 kB |
| Existing logo asset | 9.44 kB | 9.44 kB |
| git diff --check | Passed | Passed |

The baseline Vite build initially encountered sandbox `spawn EPERM`; it passed when allowed to launch its required child process. The final build used the same permission. No dependency was installed to resolve this. Backend test output includes Node's experimental SQLite notice and the expected generic error-handler message for a deliberately oversized request; no sensitive values are logged.

## Final account model and trust boundary

Manager authentication represents an **operational branch account**, not a proven individual human. A provisioned Manager has a stable branch assignment, the reviewed official mailbox and the exact operational branch name, for example Wani Branch. Head Office may later use its own operational account after separate authorization.

The bank controls mailbox and workstation access. Anyone able to read the operational mailbox can potentially establish or reset that account's password. This implementation does not identify which human used shared credentials. Mailbox access removal, mailbox MFA where available, controlled workstations and handover procedures remain organizational responsibilities.

New report/audit actors naturally snapshot the operational account's `users.name` through the existing audit service. Existing historical person-looking development names are not rewritten. Account security events identify the subject account and the controlled operator or account-token flow; they do not invent a human login actor.

No current Manager email was converted. No current Head Office identity was replaced. No public registration or account-administration endpoint was added. ADMIN central-read compatibility and EMPLOYEE reporting exclusion remain unchanged.

## Migration status and reviewed preflight

Tool: [Bank-backend/scripts/phase5d-migration.js](Bank-backend/scripts/phase5d-migration.js).

Executed **only**:

```powershell
node scripts/phase5d-migration.js --inspect
```

The inspector loaded connection configuration privately; `.env` contents were not opened or printed. It used a read-only transaction, aggregate queries and schema metadata, then rolled back/closed the connection. Password values/hashes were not returned: only a count of invalid active bcrypt encodings was calculated inside MySQL.

Observed preflight:

```text
users: 58
is_active=1 -> ACTIVE: 38
is_active=0 -> DISABLED: 20
invalid active flags: 0
invalid active bcrypt encodings: 0
blocked findings: none
planned statements: 7
fingerprint: 9d13b0a29c9d5875d17abec251a7fd07e991e6767ee5b339761243fdd69f9a8e
CURRENT DEVELOPMENT DB MIGRATED: NO
```

The code checks expected column definitions, indexes, restrictive foreign keys, table engines, extra columns, checks/triggers and partial state migration. A fully migrated expected schema has an empty plan. Unexpected structures fail safely for manual review. Partial nullable-state migration can resume, mapping only NULL states.

### Exact planned statements

These statements are documentation of the plan, **not executed SQL**:

```sql
ALTER TABLE users ADD COLUMN account_state ENUM('INVITED','ACTIVE','DISABLED') NULL DEFAULT NULL;

UPDATE users
SET account_state = CASE WHEN is_active=1 THEN 'ACTIVE' ELSE 'DISABLED' END
WHERE account_state IS NULL;

ALTER TABLE users MODIFY COLUMN account_state ENUM('INVITED','ACTIVE','DISABLED') NOT NULL DEFAULT 'INVITED';

ALTER TABLE users ADD COLUMN auth_version INT UNSIGNED NOT NULL DEFAULT 0;

ALTER TABLE users ADD COLUMN password_changed_at DATETIME(6) NULL;

CREATE TABLE account_action_tokens (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    purpose ENUM('SETUP','RESET') NOT NULL,
    token_hash BINARY(32) NOT NULL,
    auth_version INT UNSIGNED NOT NULL,
    created_at DATETIME(6) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    used_at DATETIME(6) NULL,
    revoked_at DATETIME(6) NULL,
    UNIQUE KEY token_hash (token_hash),
    KEY user_purpose (user_id, purpose),
    KEY expires_at (expires_at),
    CONSTRAINT phase5d_token_user_fk FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE account_security_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    subject_user_id INT NOT NULL,
    actor_user_id INT NULL,
    actor_source VARCHAR(40) NOT NULL,
    operator_reference VARCHAR(100) NULL,
    action VARCHAR(50) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    KEY subject_timeline (subject_user_id, created_at),
    KEY actor (actor_user_id),
    CONSTRAINT phase5d_event_subject_fk FOREIGN KEY (subject_user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT phase5d_event_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

No business report/item/audit schema change. No email, name, branch assignment or existing password hash is changed. `password_changed_at` remains NULL for historical users. `is_active` is retained.

Application consistency:

- INVITED: inactive, NULL password for newly provisioned accounts; cannot ordinary-login.
- ACTIVE: active flag and usable bcrypt password; login performs actual bcrypt verification.
- DISABLED: inactive, rejected even with a previously valid password/token; hash may be retained for history but cannot authorize access.

### Migration execution and rollback considerations

**Do not run the following until the migration review is accepted and a verified backup exists.** The plan fingerprint must be regenerated after any intervening schema/user-state changes.

1. Keep production mail disabled. Stop application/CLI writers and prevent automatic backend restarts.
2. Back up the entire database with a protected, verified restore path. Backup location/content is outside this task; no backup containing credentials was printed or created here.
3. Run the inspector again and review its exact plan and counts.
4. Only after separate authorization, run from `Bank-backend`:

```powershell
node scripts/phase5d-migration.js --apply --reviewed-plan REVIEWED_FINGERPRINT --backup-confirmed --writers-stopped
```

Replace `REVIEWED_FINGERPRINT` with the current inspector's 64-character value. The apply tool refuses missing acknowledgments, a changed fingerprint or blocked findings, takes an operator advisory lock and performs post-inspection. No startup route invokes it.

MySQL DDL implicitly commits. A failure does not roll back preceding DDL. Leave writers stopped, inspect and either resume the compatible partial migration or perform a separately reviewed restore. No automatic down migration drops tokens/events. After credential changes have occurred, rolling back to Phase 5C auth would bypass version/state enforcement; do not casually revert code or discard security history. Prefer forward correction with the backup available for a coordinated recovery.

**Runtime compatibility:** the updated backend deliberately requires the new columns. It will fail closed against the currently unmigrated database. Do not restart/use the Phase 5D backend against it yet. Keep the committed Phase 5C runtime until the separately reviewed migration and code rollout are coordinated. There is no fail-open legacy-auth fallback. After migration, existing development emails/password hashes remain usable through a new login; old versionless JWTs are rejected.

## Authentication and session invalidation

New access JWTs retain HS256 and the 10-hour duration and include `auth_version`. Protected middleware still reads the current user on every request, now including account state and version. ACTIVE + `is_active=1` + exact numeric version match is required. Missing, string-valued, invalid or stale versions fail closed. Role/branch authority still comes from the database rather than JWT compatibility claims.

Login checks active state/version/password, compares bcrypt, then re-reads the identity to detect a password reset or disable during the asynchronous comparison. It signs the version whose password was actually checked. A subsequent reset makes that token stale even if the signing operation was already in flight.

Version increments are implemented for initial setup, reset and account disable. Successful setup/reset set UTC `password_changed_at`, clear outstanding action credentials and require normal sign-in; neither endpoint returns a JWT. Disabling is idempotent and records one actual transition.

Reactivation, branch transfer, role edits and email/recovery-address edits are **not exposed by this phase's CLI or API**. Direct SQL edits are not a supported lifecycle workflow. Any future implementation must lock the user, validate state/branch/email, increment `auth_version`, revoke outstanding action tokens and record its specific event in the same transaction. A disabled account cannot be reactivated by forgot/reset or setup. No fake reactivation/transfer events are emitted. For branch operational accounts, prefer a reviewed disable/new invitation when a distinct operational identity is required; never reassign old reports or actor IDs.

Frontend authenticated 401 handling remains unchanged and clears local session storage. No refresh tokens, session inventory or broad authentication replacement was added. Revocation applies to subsequent protected checks; it cannot cancel a report transaction already authorized in flight.

## Setup/reset tokens and password policy

One internal service handles both purposes. It creates 32 random bytes with Node crypto, encodes them as URL-safe base64, and stores only the SHA-256 digest. Raw tokens travel only through the internal issuance-to-mail boundary, never public responses, CLI output or security-event fields.

Tokens bind to user, purpose and auth version. Consumption checks state, expiry, use/revocation flags and matching version, locks user first and token second, and atomically changes credentials, consumes the token, revokes outstanding tokens and records the event. A transaction failure restores the previous credentials/token state. Concurrent consumers produce only one successful change. Reissue revokes prior same-purpose tokens. Completion invalidates every other outstanding token for that account.

All credential timestamps and comparisons use MySQL UTC functions, independently of existing report/business-date semantics. Defaults and validated bounds:

| Setting | Default | Allowed |
| --- | ---: | --- |
| SETUP_TOKEN_SECONDS | 86400 (24 hours) | 900..86400 |
| RESET_TOKEN_SECONDS | 1800 (30 minutes) | 300..3600 |
| PASSWORD_BCRYPT_COST | 12 | 10..14 |

New password policy: at least **15 Unicode code points**, maximum **72 UTF-8 bytes**, exact confirmation match, non-whitespace content and no ASCII control characters. Spaces/passphrases are accepted with no mandatory uppercase/lowercase/symbol categories. Repeated single-character values and a small set of obvious predictable strings are rejected. This is not a comprehensive compromised-password service. The byte bound prevents bcrypt truncation; it is intentionally distinct from a JavaScript character count. Existing hashes are not bulk-replaced, and existing login password behavior is retained for compatibility. Tests inject a lower bcrypt cost only into isolated fixtures for speed; runtime configuration rejects it.

## HTTP behavior and abuse controls

| Endpoint | Behavior |
| --- | --- |
| POST /api/auth/forgot-password | Accepts email; 202 with the same generic message for valid requests regardless of account eligibility. Only ACTIVE MANAGER/HEAD_OFFICE accounts can receive RESET mail. Never enables invited/disabled users or accepts a caller-selected destination. |
| POST /api/auth/setup-password | Token/password/confirmPassword; SETUP + INVITED only; establishes bcrypt credentials, activates, increments version, consumes/revokes and audits; returns a sign-in message only. |
| POST /api/auth/reset-password | Same fields; RESET + ACTIVE only; changes password/version, consumes/revokes and audits; returns a sign-in message only. |
| POST /api/auth/login | Original email/password and response contract, with active-state/version enforcement and race protection. |

Recovery routes share an IP limit of 15 requests per five minutes and a 4 KB JSON limit. Malformed JSON, oversized bodies and throttling return generic 400/413/429 responses. Normal forgot requests use a bounded 32-job in-process background queue, so account lookup and provider latency do not determine response timing. Saturation gives the same response without queuing more work. Issuance also enforces a persistent 60-second per-account cooldown under the user lock, across workers.

Delivery errors never reveal account existence/provider details to HTTP clients. If a send fails or times out, the exact issued token is revoked without changing the password or revoking a later reissue. CLI delivery status may say failed, but never prints the token/link. A process crash after token commit and before delivery leaves an unused expiring token; a later request/reissue recovers. The queue is deliberately not a durable enterprise messaging system.

## Mail abstraction and configuration

No new dependency. `credential-mail.service.js` defaults to disabled. A test-only injected transport captures synthetic messages in memory. Production transport injection is rejected.

The supplied deployment adapter POSTs `{from,to,subject,text}` to an **authorized HTTPS mail gateway** using a configured bearer API key, a 10-second timeout and redirects disabled. It is provider-neutral at this boundary; it is not an SMTP client and does not claim arbitrary vendors accept this JSON format. Choose a compatible gateway or add a reviewed provider/SMTP adapter later. No delivery provider was configured or contacted here.

Real HTTP delivery requires a nonempty explicit recipient allowlist; no wildcard. For the Wani pilot, that list must contain only the separately authorized Wani mailbox. A configured mail adapter cannot send to Head Office or synthetic development recipients outside that allowlist.

Configuration placeholders are in `.env.example`:

```text
CREDENTIAL_MAIL_TRANSPORT=disabled
CREDENTIAL_APP_ORIGIN=https://reporting.example.invalid
CREDENTIAL_MAIL_ENDPOINT=https://mail-gateway.example.invalid/send
CREDENTIAL_MAIL_FROM=reporting@example.invalid
CREDENTIAL_MAIL_API_KEY=
CREDENTIAL_MAIL_ALLOWED_RECIPIENTS=
```

Actual configuration stays in the authorized deployment environment. No SMTP/mailbox password is required for the branch recipient. Sender/provider secrets must never be placed in the command line, screenshots or tracked files. Gateway policy must prohibit message-body/token logging, and sender/domain authorization and delivery must be verified before the pilot.

Links use `/setup-password#token=...` or `/reset-password#token=...`. The fragment is not sent to the web server as part of its URL. Recovery pages remove it from the visible address/history entry and hold it only in component memory; reload then requires reopening the email. No token localStorage/sessionStorage, external scripts or automatic login. Recovery pages set no-referrer; the hosting layer must also send no-store/no-referrer and avoid telemetry on these routes. Existing backend responses already use no-store.

## Controlled provisioning CLI

Tool: `node scripts/branch-account.js` from `Bank-backend`. Access depends on restricted OS/deployment access to the tool and DB credentials, not a public registration route. `--operator` is a controlled operator/change reference; it is not cryptographic human authentication.

Supported commands: `invite`, `reissue`, `disable`. Default is dry-run; `--dry-run` is explicit and cannot be mixed with `--apply`. Unknown/repeated flags fail. There is no batch operation, reset-to-default-password option, credential dump or secret output.

Invite requires stable branch code, explicit verified official-domain email, exact operational branch display name, supported role and operator reference. It validates active branch, appropriate branch type/role, matching reviewed branch contact, unique login email and absence of an active/invited incumbent for that branch/role. Apply repeats checks under a branch lock. An existing email or incumbent is a refusal, never an implicit edit. New user starts INVITED/inactive with NULL password and version zero.

`--apply --send-email --mailbox-verified` and configured mail are all required for invitation/reissue. The same explicit command commits the invitation/token/event and invokes the mail boundary; there is no separate command that prints a setup URL. Failed mail leaves a recoverable inactive invitation with the failed token revoked.

Reissue requires the exact user ID and expected email, INVITED/inactive/NULL-password state and still-valid operational branch mapping. Disable requires exact ID/expected email; it increments version, revokes tokens and records the operator event, retaining all report/audit references. ID is never assumed to equal branch ID.

The supported security-event allowlist is exactly ACCOUNT_INVITED, SETUP_REISSUED, PASSWORD_ESTABLISHED, PASSWORD_RESET, ACCOUNT_DISABLED. Other proposed future actions are not emitted. Events include subject ID, NULL actor ID for these operator/token flows, actor source, optional operator reference, action and UTC time. No password/hash/token/header/body is stored there. Report milestones remain in the unchanged report audit table.

## Wani readiness: deferred manual procedure

**Nothing in this section was executed. Do not execute it until implementation/migration review and a one-mailbox pilot are separately authorized.** No current Wani user was modified, and no real email was sent.

Prerequisites: reviewed migration completed; updated backend/UI running against that schema; authorized gateway/sender configured; trusted application HTTPS origin; `CREDENTIAL_MAIL_ALLOWED_RECIPIENTS` set to **only** `aucb_wani@akolaurban.bank.in`; bank confirms mailbox/workstation custody. Do not obtain the mailbox password. Record the real operator/change reference.

1. From `Bank-backend`, dry-run the intended account:

```powershell
node scripts/branch-account.js invite --branch-code AUCB038 --email aucb_wani@akolaurban.bank.in --name "Wani Branch" --role MANAGER --operator "REVIEWED_OPERATOR_REFERENCE" --dry-run
```

2. Review actual branch mapping and incumbent account(s) with a restricted read-only database client:

```sql
SELECT branch_id, branch_code, branch_name, branch_email, branch_type, is_active
FROM branches WHERE branch_code = 'AUCB038';

SELECT u.user_id, u.email, u.role, u.branch_id, u.account_state, u.is_active
FROM users u JOIN branches b ON b.branch_id = u.branch_id
WHERE b.branch_code = 'AUCB038' AND u.role = 'MANAGER';
```

Expected reviewed branch candidate is ID 38 / AUCB038 / Wani Branch, but verify it; do not infer a user ID from it. Existing active development Manager coverage means the first invite dry-run should **refuse the incumbent collision** until a reviewed handover. This is intentional protection.

3. After separately authorizing retirement of the incumbent Wani development login, substitute the reviewed actual user ID/email and operator reference. Run disable dry-run, review, then explicit apply:

```powershell
node scripts/branch-account.js disable --user-id REVIEWED_USER_ID --email REVIEWED_EXISTING_EMAIL --operator "REVIEWED_OPERATOR_REFERENCE" --dry-run
node scripts/branch-account.js disable --user-id REVIEWED_USER_ID --email REVIEWED_EXISTING_EMAIL --operator "REVIEWED_OPERATOR_REFERENCE" --apply
```

Placeholders must be replaced; these examples are not commands to run unchanged. Disable all reviewed active/invited Wani Manager incumbents if the state has changed, without touching unrelated branches. This preserves their user rows, original report creator references and audit history while revoking their access.

4. Repeat the invite dry-run from step 1. Once it reports the correct unblocked mapping, explicit apply also sends the one setup email:

```powershell
node scripts/branch-account.js invite --branch-code AUCB038 --email aucb_wani@akolaurban.bank.in --name "Wani Branch" --role MANAGER --operator "REVIEWED_OPERATOR_REFERENCE" --apply --send-email --mailbox-verified
```

5. The authorized branch mailbox user opens the received link on the trusted application origin, chooses/confirms their own password, then returns to sign-in. The operator never knows or receives that password. If delivery failed, review the safe CLI status and exact new account ID; dry-run then explicitly apply a reissue:

```powershell
node scripts/branch-account.js reissue --user-id REVIEWED_INVITED_USER_ID --email aucb_wani@akolaurban.bank.in --operator "REVIEWED_OPERATOR_REFERENCE" --dry-run
node scripts/branch-account.js reissue --user-id REVIEWED_INVITED_USER_ID --email aucb_wani@akolaurban.bank.in --operator "REVIEWED_OPERATOR_REFERENCE" --apply --send-email --mailbox-verified
```

6. Sign in as the Wani operational account. Verify Wani branch context and read-only access to its existing history; confirm another branch's report ID is inaccessible and Head Office routes are denied. Any test report mutation needs a separate disposable-report decision; this readiness check does not authorize cleanup or final-locking business data.
7. Verify the retired Wani development password/login and its captured pre-disable JWT no longer authorize requests. Do not copy tokens into logs or this document. Verify a different branch Manager remains confined to their own branch and cannot read Wani's report. Password equality across accounts is not the isolation boundary; current user/branch/role is.
8. Test forgot/reset for Wani alone: generic response, link from the configured mailbox, new password, old password rejected and pre-reset token rejected, ordinary new login succeeds. Reused/expired links fail. Verify account security events and unchanged report ownership. Do not include passwords/tokens in evidence.

## Head Office procedure remains deferred

The current synthetic Head Office user remains intact. No `aucb_ho` provisioning, activation or email occurred. Keep it out of the pilot mail allowlist.

After a separate Head Office authorization: review its Administrative Office branch mapping, independently correct the known incorrect contact email in a separately reviewed data change, confirm mailbox control, authorize the real recipient in the mail allowlist, explicitly retire the synthetic incumbent when ready, then use the same dry-run/apply invitation process with branch code AUCB001, the exact reviewed operational branch name and role HEAD_OFFICE. The current contact mismatch and incumbent both block blind provisioning. Do not bypass those guards. Shared HO credentials provide operational account attribution only, with existing central final-lock/correction authority; no personal attribution claim is added.

## Historical creator display fix

Head Office report detail now takes `daily_business_entries.manager_name` from the stored header and does not join current `users.name` over it. The UI label is **Report creator (recorded)**. A regression fixture creates a report with Manager A's snapshot, renames/reassigns the user row, then runs the actual detail SQL and verifies the stored creator remains A and the branch filter remains intact.

No report or audit row was rewritten. Creator remains original creator, not necessarily last editor/submitter. Report tenancy, creator FK, audit snapshots and action rules are unchanged.

## Frontend and browser verification

Login retains Phase 5B layout, branding, inputs, background and original Login.css. Its only new UI element is the requested Forgot password link; adding it naturally adds space to the existing card. No assertion of byte-identical screenshots is made for this authorized addition. Login CSS, shared theme, operations CSS, document metadata and logos are unchanged from Phase 5C's scope-corrected baseline.

New `/forgot-password`, `/setup-password`, `/reset-password` screens reuse the existing blue/orange visual language. Recovery-specific CSS is scoped; it does not redesign Manager/HO workspaces. Password confirmation/policy feedback, generic forgot completion, invalid/expired links, disabled pending buttons and sign-in navigation are present. A separate unauthenticated Axios instance has no bearer interceptor and no authenticated 401 redirect. API errors are mapped to safe messages.

The headless Edge suite intercepted all API traffic, blocked nonlocal requests and used synthetic addresses and responses. It exercised:

- Forgot action/navigation and generic unknown-account completion.
- Setup and reset forms, confirmation mismatch, invalid/expired server feedback, completion without login, missing-link fallback, hash removal and no token persistent storage.
- Recovery requests without Authorization even when localStorage held a synthetic existing access token.
- Manager draft/row/submit/correction/date/retry/read-only workflows.
- Head Office 38-branch overview, search/filter, correction decisions, final lock, safe audit text, analytics and logout.
- Recovery and authenticated pages at 1440, 1024, 768 and 390px, with no page overflow or runtime exceptions. Login captured at the three desktop/tablet widths; existing responsive behavior retained.

An initial recovery-page decorative-circle overflow at 390px was corrected with scoped recovery rules. The final suite passed. Screenshots: `C:\Users\khush\AppData\Local\Temp\bank-phase5c-ui-zzr8p9` (the existing harness retains its Phase 5C temporary-directory prefix). Login desktop and recovery phone screenshots were visually inspected. No real backend login, live report mutation or mailbox access occurred.

## Tests and limits of evidence

54 new backend tests cover lifecycle schema/preflight, idempotence/partial migration, bad schema/FKs/flags/hashes, apply acknowledgments, secure provisioning and dry-run, collisions, synthetic Wani/HO preservation, token purpose/expiry/replay/revocation/version/state, concurrent consumption, audit failure rollback, mail failure and allowlist, password Unicode boundaries, generic recovery/queue, HTTP limits, login races, JWT rejection and historical snapshot display.

The existing 283 tests remain. Only relevant fixtures were adapted to include ACTIVE state/auth_version and the expanded identity projection; previous authorization and disclosure assertions were retained. Rate-limiter fixtures now allocate a separate memory store per limiter. No old tests were skipped or assertions disabled.

Credential transaction tests use isolated **in-memory SQLite** with UTC function adapters and serialized fixture transactions; the actual service SQL and atomic rollback behavior execute there. They check that production queries contain the user/token locking clauses, but are not a live MySQL/InnoDB concurrency stress test. Migration tests use synthetic metadata; the actual MySQL run was inspection only. A separately authorized isolated-MySQL apply/verification is recommended before applying to the development database. No test database was created in the live server.

Commands used:

```powershell
# Bank-backend
$tests = @(rg --files scripts -g '*.test.js')
node --test --test-isolation=none @tests
# node --check was run for each backend .js file excluding node_modules.
node scripts/phase5d-migration.js --inspect

# frontend
node --test --test-isolation=none scripts/operations.test.mjs scripts/credentials.test.mjs
npm run lint
npm run build
node scripts/ui-smoke.mjs

# repository
git diff --check
```

All test mail is synthetic/in-memory; the HTTP gateway adapter test replaces fetch with an in-memory stub. Only local loopback HTTP/browser servers were used. No external mail/network service was contacted by implementation tests.

## Files changed

| Area | Files |
| --- | --- |
| Auth changes | `Bank-backend/controllers/auth.controller.js`, `middleware/auth.middleware.js`, `routes/auth.routes.js` |
| New lifecycle controller/config | `Bank-backend/controllers/credential.controller.js`, `config/credentials.js` |
| New services | `Bank-backend/services/credential-policy.js`, `credential.service.js`, `credential-mail.service.js`, `account-security.service.js`, `account-provisioning.service.js` |
| New operator tools | `Bank-backend/scripts/phase5d-migration.js`, `branch-account.js` |
| Creator fix | `Bank-backend/controllers/business.controller.js`, `frontend/src/components/AdminBusinessReports.jsx` |
| New backend tests | `Bank-backend/scripts/phase5d-credentials.test.js`, `phase5d-migration.test.js`, `helpers/credential-fixture.js` |
| Existing test fixture adaptation | `Bank-backend/scripts/phase1-security.test.js`, `phase5b-security.test.js`, `helpers/report-fixture.js` |
| Frontend routing/Login action | `frontend/src/App.jsx`, `pages/Login.jsx` |
| New recovery UI/client/helpers | `frontend/src/pages/CredentialRecovery.jsx`, `CredentialRecovery.css`, `services/recoveryApi.js`, `utils/credentials.js` |
| Frontend verification | New `frontend/scripts/credentials.test.mjs`; extended `scripts/ui-smoke.mjs` |
| Configuration/docs | `Bank-backend/.env.example`, `Bank-backend/DATABASE_UTILITIES.md`, new `PHASE5D_REVIEW.md` |

`PHASE5D_ACCOUNT_MODEL_ASSESSMENT.md` was already untracked at preflight and is unchanged. Package manifests/lockfiles, business report/audit services, Login.css, akola-theme.css, operations.css and index.html have no differences. No dependencies changed.

## Live actions, remaining risks and next steps

Live DB actions were read-only schema/preflight and aggregate verification. Final inspection shows zero Phase 5D user columns/tables, 37 active Managers, one active Head Office user, 20 inactive Employees, eight report headers, eight items and one report audit event. The Administrative Office still has its original incorrect Main Branch contact; no silent correction occurred. There are zero login rows using either proposed official Wani or HO address.

Remaining limits:

- Do not run this updated backend against the old schema; migration and code rollout must be coordinated.
- Database schema/password changes are not undone by Git revert. Backup/restore and operator review are required before migration apply.
- The branch mailbox is the recovery authority. App password reset cannot repair compromised mailbox/workstation custody. Shared accounts provide no independent human accountability.
- Real sender/provider configuration and deliverability are untested. The HTTP gateway contract must be implemented by the chosen authorized mail service. No SMTP dependency or real provider integration was assumed.
- The bounded in-memory queue can lose pending work on restart. Users can retry; no account activation happens merely on forgot request. Provider timeouts revoke the attempted link, possibly requiring reissue.
- The IP limiter is process-local; per-account issuance cooldown is database-backed. Multiple API instances require a coordinated IP limiter before such deployment.
- Current bearer/localStorage architecture is retained. No claims of protection against arbitrary same-origin script compromise or already-authorized in-flight work.
- Only invite/reissue/disable and setup/reset are supported. Reactivation or identity edits require a future reviewed version-bumping operation, not ad hoc SQL.
- Browser evidence covers Edge and synthetic APIs, not real mailbox access or all browser/assistive-technology combinations.

Exact next step: review this code, exact migration plan, backup/rollback approach and test limitations. Then separately authorize migration execution with writers stopped. Only after successful migrated-schema verification should the single-recipient Wani pilot be authorized. Keep real Head Office, mass account conversion, test-report cleanup, deployment, commit and push deferred.

PHASE 5D CODE IMPLEMENTED: YES
CURRENT DEVELOPMENT DB MIGRATED: NO
LIVE BUSINESS DATA MUTATED: NO
EXISTING TEST REPORTS DELETED: NO
EXISTING MANAGER EMAILS MASS-CONVERTED: NO
REAL WANI ACCOUNT MODIFIED: NO
REAL WANI EMAIL SENT: NO
REAL HEAD OFFICE ACCOUNT MODIFIED: NO
REAL HEAD OFFICE EMAIL SENT: NO
PLAINTEXT DEFAULT PASSWORDS CREATED: NO
RAW SETUP/RESET TOKENS LOGGED: NO
BACKEND REGRESSION TESTS PASS: YES
FRONTEND BUILD/LINT PASS: YES
COMMITTED: NO
PUSHED: NO

## Post-migration local runtime verification

### Latest result — runtime verification and safe cleanup complete — 2026-09-23

**Complete: all requested functional runtime checks passed, the remaining harness error was diagnosed, runtimes stopped, and temporary users 59 and 60 were safely removed. Final user count: 58.** This result supersedes the incomplete attempts below, which remain as history.

The continuation first ran a startup/origin-probe/shutdown-only diagnostic without login or database writes. It completed with no error. The ignored helper then gained safe console call-site classification and a corrected shutdown check. Preflight again matched the saved original-data baseline and confirmed the exact temporary identities, ACTIVE state, versions 3/2, and zero references across all 8 user foreign keys. No original user or application configuration was changed.

Fresh random credentials stayed in process memory and replaced only the two temporary bcrypt hashes, incrementing versions to 4/3. The real browser/MySQL run again passed every Manager, Head Office, JWT, authorization, report/audit/analytics, and recovery-page check. Only temporary Manager 59 was then incremented to version 5; its old JWT received 401. The Head Office temporary version remained 3. All recorded browser API responses were 200; expected denial responses were checked separately by real HTTP requests. No API mocking or response interception was used.

#### Final harness diagnosis

The only counted `console.error` originated at `frontend/node_modules/@babel/generator/lib/index.js:67`, followed by generator and transformation call sites. That exact statement emits Babel's informational formatting note when generated source exceeds 500 KB. It is **not a backend/application error**. A separate credential-free synthetic generator invocation reproduced exactly one such note. The helper's broad process-wide counter had incorrectly treated it as an application failure: **classification A, harness expectation problem**. Browser runtime exceptions were zero.

Only the ignored helper was corrected to recognize that exact Babel note separately; all other errors remain failures with safe diagnostics. No dependency or application source was patched and no security policy was relaxed. The last functional run stopped at this false-positive guard; after identifying it conclusively, no additional credential rotation or full runtime retry was needed. The corrected shutdown completed and the helper session exited. No Node runtime remained before final cleanup.

#### Final cleanup and preservation

With all required functional checks passed and the remaining guard proven to be informational tooling output, a narrowly scoped cleanup transaction locked and validated the exact two temporary identities and their current versions. It verified the original baseline and zero references across all 8 user foreign keys, then deleted **only user IDs 59 and 60 with their expected development-only emails**. Exactly two rows were removed. All original fingerprints matched inside the transaction before commit and again after commit. Both temporary IDs/emails are absent. AUTO_INCREMENT was not reset.

Final preservation evidence: **58 original users; 38 branches; 8 reports; 8 items; 1 report-audit row; 13 tasks; 15 task updates; 0 time logs; 0 account action tokens; 0 account security events**. Full-row canonical fingerprints match the saved baseline for every original table, including all original user password hashes, identities, assignments and lifecycle fields. Wani and the existing Head Office account are unchanged. No report status, amount, date, item or audit content changed. No mail, invitation or credential token was generated. Only this review and ignored local helper/evidence files were changed by this continuation. No application defect was found, so application code and regression suites were left unchanged. `git diff --check` passed.

```text
BACKEND STARTUP: PASS
FRONTEND STARTUP: PASS
MANAGER LOGIN: PASS
JWT AUTH_VERSION CLAIM: PASS
CURRENT DB IDENTITY: PASS
MANAGER BRANCH CONTEXT: PASS
MANAGER WORKSPACE: PASS
MANAGER OWN READS: PASS
CROSS-BRANCH DENIAL: PASS
MANAGER HEAD-OFFICE DENIAL: PASS
HEAD OFFICE LOGIN: PASS
HO OVERVIEW: PASS
HO REPORT DETAIL: PASS
HO AUDIT HISTORY: PASS
HO ANALYTICS: PASS
STALE JWT REJECTION: PASS
RECOVERY UI: PASS
ORIGINAL 58 USERS PRESERVED: YES
TEMP USERS REMOVED: YES
FINAL USER COUNT: 58
BUSINESS DATA MUTATED: NO
REAL EMAIL SENT: NO
WANI MODIFIED: NO
APPLICATION SOURCE CHANGED: NO
COMMITTED: NO
PUSHED: NO
```

### Earlier attempt — step-by-step harness diagnosis — 2026-09-23

**All requested functional checks passed, but the final error-counter guard failed. Temporary users remain; runtimes are stopped.** The exact failing guard and remaining uncertainty are recorded below. Earlier attempts are retained as history.

#### Diagnosis before retry

Reviewed the helper's post-login sequence: Manager workspace selector; numeric JWT version and user-ID comparison; login identity/branch comparison; displayed branch code; direct my-entries status; direct history status; cross-branch report/audit denial; Head Office overview/analytics denial; and frontend Head Office-route redirect. The recorded browser my-entries/history 200 responses were separate from the helper's later direct API calls.

The likely previous stopping assertion was `manager current identity`: the helper requested `/business/my-entries` **without a date** and expected 200. The controller passes `req.query.date` directly into report reading, which requires a valid calendar date. An isolated, database-free invocation confirmed **400** for the omitted date. This is **A: a harness expectation problem**, not an application defect. Only the ignored helper was corrected to provide an existing report date. Cross-branch 404, role-denial 403 and stale-token 401 expectations were checked against the existing service/middleware and authorization tests before execution.

The helper now records named PASS markers after each step and explicit safe assertion metadata on failure, including expected/actual HTTP status where applicable. No passwords, hashes, tokens, headers, request bodies, environment contents or sensitive response bodies are logged. Application source and security policy were not changed.

#### Preflight and controlled temporary credentials

Users 59 and 60 matched their expected development-only identities, roles, branches, ACTIVE state and auth_version 1. All 8 user foreign keys had zero references. The original 58-user fingerprint and every original table fingerprint matched the saved baseline; no Node runtime remained. The existing allowed localhost frontend origin was reused with strict port binding. Mail remained disabled and unconfigured.

Only the two authorized temporary bcrypt hashes were replaced in a transaction, using fresh in-memory random passwords, and their versions increased from 1 to 2. No other user fields changed. No setup/reset token or mail was generated.

#### Functional runtime evidence

- Manager: real browser login passed; JWT signature and numeric version 2 passed; browser identity matched the current MySQL identity; protected identity resolution passed; MANAGER role and Ramdaspeth branch ID 3/code AUCB003 passed; Manager workspace and branch context rendered; dated my-entries/history returned 200.
- Isolation: a specifically selected existing report outside branch 3 and its audit endpoint both returned 404. Head Office overview and central analytics returned 403 for Manager; frontend `/admin` redirected to login.
- Head Office: real browser login, numeric JWT version 2, current identity and HEAD_OFFICE role passed. Daily Operations displayed the expected 38 branch IDs; existing report detail and its nonempty audit timeline rendered; analytics rendered. Real backend/MySQL calls were used throughout, with no API mocking/interception.
- Version invalidation: a controlled transaction incremented only user 59 from version 2 to 3. The previously valid JWT then received 401 on the protected history endpoint.
- Recovery: forgot-password, setup-password and reset-password routes rendered. Setup/reset without tokens showed the safe invalid/expired-link state. No recovery HTTP request was made, no token generated and no mail sent.

#### Exact failure and shutdown

After the recovery pages passed, the helper's additional final guard failed with this safe diagnostic:

```text
step: recovery reset
assertion: no runtime errors
expected browser exception count: 0
actual browser exception count: 0
expected server-process console.error count: 0
actual server-process console.error count: 1
```

Classification: **C: inconclusive** for this final guard. The `backendErrors` counter actually wraps process-wide `console.error`, including the in-process Vite harness; it does not establish that a backend application error occurred. The source/message of that one call was not retained. All recorded browser API responses during this run were 200. No application defect is established, and no application patch or further runtime retry was attempted.

The failure handler stopped further assertions and retained users as requested. Its graceful browser shutdown also reported the named `browser shutdown` assertion. The helper command/process ancestry was then verified and only its remaining process tree was stopped. The execution session exited and a subsequent process check found no Node runtime. No unrelated browser was targeted.

The failure handler independently recomputed all original table fingerprints, excluding only temporary users: **originalDataPreserved=true**, total users **60**. This includes all 58 original users, 38 branches, 8 reports, 8 items, 1 report-audit row, 13 tasks, 15 task updates, zero time logs, zero action tokens and zero account security events. A read-only check after shutdown confirmed zero references across all 8 user foreign keys. User 59 remains ACTIVE/version 3; user 60 remains ACTIVE/version 2. No user deletion or AUTO_INCREMENT reset occurred.

The functional PASS results below do **not** mean the entire run passed: the final diagnostic/shutdown guards failed and cleanup was therefore withheld.

```text
BACKEND STARTUP: PASS
FRONTEND STARTUP: PASS
MANAGER LOGIN: PASS
JWT AUTH_VERSION CLAIM: PASS
CURRENT DB IDENTITY: PASS
MANAGER BRANCH CONTEXT: PASS
MANAGER WORKSPACE: PASS
MANAGER OWN READS: PASS
CROSS-BRANCH DENIAL: PASS
MANAGER HEAD-OFFICE DENIAL: PASS
HEAD OFFICE LOGIN: PASS
HO OVERVIEW: PASS
HO REPORT DETAIL: PASS
HO AUDIT HISTORY: PASS
HO ANALYTICS: PASS
STALE JWT REJECTION: PASS
RECOVERY UI: PASS
ORIGINAL 58 USERS PRESERVED: YES
TEMP USERS REMOVED: NO
FINAL USER COUNT: 60
BUSINESS DATA MUTATED: NO
REAL EMAIL SENT: NO
WANI MODIFIED: NO
APPLICATION SOURCE CHANGED: NO
COMMITTED: NO
PUSHED: NO
```

### Earlier attempt — authorized temporary credential replacement — 2026-09-23

**Incomplete. The real Manager login and protected Manager reads succeeded, but the helper stopped during its remaining Manager assertions. Runtime processes were stopped; temporary users 59 and 60 remained.** This attempt is retained as historical evidence.

Preflight confirmed the exact development-only identities, names, roles, branches and ACTIVE state for users 59 and 60, both initially at auth_version 0. All 8 discovered user foreign keys had zero references to either temporary user. Full-row canonical fingerprints for the original 58 users and all other tables matched the saved pre-runtime baseline. Process/listener checks found no Node runtime or development-port listener from the previous attempt.

Only the ignored verification helper was changed. It selected the already-permitted localhost frontend origin with a fixed port and strict port binding, retaining the real Vite-to-backend HTTP proxy. It did not change `.env`, the application's origin allowlist, CORS middleware, or any application source. The actual backend and frontend started successfully; a request carrying the selected origin passed the backend's CORS check. Mail transport remained explicitly disabled and unconfigured.

As newly authorized, a transaction replaced only the bcrypt password fields for users 59 and 60 and incremented each auth_version from 0 to 1. Random passwords were generated and retained solely in the helper process, passed directly to the isolated browser, and never printed or persisted. All other fields on those temporary users were retained; no original user was updated. No invitation, setup/reset token, mail request, migration or report mutation was performed.

The real browser received **HTTP 200 from `/api/auth/login`**, followed by **HTTP 200 from `/api/business/my-entries` and `/api/business/history`**. This establishes successful real-MySQL Manager authentication and successful protected Manager reads under the current-identity middleware. It also shows that the earlier origin mismatch no longer blocked login. Only endpoint paths and status codes were retained; no response bodies, credentials or tokens were logged.

The helper subsequently failed in the Manager login stage before its remaining identity/branch/JWT assertions completed. It did not retain the exact failed assertion, so no definitive application defect or specific assertion failure is claimed. Head Office login, branch isolation, Manager denial of Head Office access, explicit JWT claim inspection, deliberate stale-token rejection, and recovery UI checks did not complete. No application code was changed and no regression suite was rerun because an application defect was not established. Per the instruction to stop if verification fails again, no retry or further password replacement was performed.

Graceful shutdown did not fully exit the helper. Its process command was verified, then only the helper and its remaining descendant were stopped. Its execution session exited, and the subsequent process check found no Node runtime. Backend/frontend are stopped. The isolated browser had already exited; unrelated browser processes were not targeted.

An independent read-only check after shutdown again matched **every original table fingerprint**: original users 58, branches 38, reports 8, items 8, report audits 1, tasks 13, task updates 15, time logs 0, account action tokens 0, and account security events 0. Original user credential/identity/lifecycle fields and existing business records remain unchanged. Both temporary users remain ACTIVE at auth_version 1 and still have zero references across all 8 user foreign keys. They were deliberately retained under the explicit failed-verification instruction. The total user count is **60**. No deletion or AUTO_INCREMENT reset was attempted.

FAIL below denotes an incomplete required verification, not a claim that each unrun application feature is defective.

```text
BACKEND STARTUP: PASS
FRONTEND STARTUP: PASS
REAL MYSQL MANAGER LOGIN: PASS
MANAGER BRANCH ISOLATION: FAIL
HEAD OFFICE AUTHORIZATION DENIAL FOR MANAGER: FAIL
REAL MYSQL HEAD OFFICE LOGIN: FAIL
HO OVERVIEW/REPORT/AUDIT/ANALYTICS: FAIL
JWT AUTH_VERSION PRESENT: FAIL
STALE JWT REJECTED AFTER VERSION CHANGE: FAIL
RECOVERY UI WITH MAIL DISABLED: FAIL
ORIGINAL 58 USERS PRESERVED: YES
TEMPORARY USERS REMOVED SAFELY: NO
FINAL USER COUNT: 60
TEST REPORTS PRESERVED: YES
BUSINESS DATA MUTATED: NO
REAL EMAIL SENT: NO
WANI ACCOUNT MODIFIED: NO
EXISTING HEAD OFFICE ACCOUNT MODIFIED: NO
APPLICATION SECURITY POLICY CHANGED: NO
COMMITTED: NO
PUSHED: NO
```

### Authorized temporary-identity attempt — 2026-09-23

**Incomplete: both runtimes started, but the Manager browser login check did not complete. Two temporary development users remain for review.** The earlier credential-blocked attempt below is retained as history.

Read-only preflight confirmed the migrated lifecycle schema, 58 original users, no collision for either authorized temporary email, and no users-table triggers. The selected active ordinary branch was **Ramdaspeth Branch, Akola, ID 3, AUCB003** (type `Branch`, not Wani or Administrative Office). The temporary Head Office branch was **Administrative Office, Akola, ID 1, AUCB001**. Existing business counts were 8 reports, 8 items, and 1 report-audit row.

The ignored purpose-built helper `.database-backups/phase5d-runtime.cjs` started the actual backend Express application on a loopback ephemeral port and the actual Vite frontend with a real API proxy. Neither API responses nor MySQL were mocked. Mail transport was explicitly disabled in the helper process, and the mail service confirmed it was unconfigured. No application source or environment file was changed.

The helper created only `runtime.manager@development.invalid` (**user ID 59**, MANAGER, branch 3) and `runtime.ho@development.invalid` (**user ID 60**, HEAD_OFFICE, branch 1), with names prefixed `DEVELOPMENT ONLY`, `ACTIVE`, `is_active=1`, `auth_version=0`, and bcrypt cost-12 hashes. Independently generated random passwords stayed in process memory and were passed directly to the isolated headless InPrivate browser. No passwords, hashes, JWTs, request bodies, screenshots, or account rows containing credentials were recorded in output or documentation. No invitation workflow was used.

Backend and frontend HTTP startup checks succeeded. The browser attempted Manager login, but the helper stopped during the Manager login stage before successful authentication could be verified. The helper's failure output suppresses exception details; no exact HTTP failure status was retained. A subsequent value-redacted configuration check confirmed that the configured CORS allowlist permits no `http://127.0.0.1` frontend origin, while the helper selected such an ephemeral origin. **A harness origin mismatch is the likely cause, not a proven application defect.** Future verification must use an explicitly allowed local frontend origin. The temporary passwords were not persisted and are no longer available after shutdown.

Graceful helper shutdown stalled. Its exact process command was verified, then only that helper and its descendant processes were stopped. The helper session exited and a subsequent process check found no remaining Node process. No unrelated browser process was intentionally stopped. No application code fix was made and no regression suite was rerun because an application defect was not established.

An independent read-only preservation check compared sorted full-row SHA-256 fingerprints against the pre-run baseline, excluding only temporary IDs 59 and 60 from users. **All 58 original user rows are byte-for-byte equivalent under the same canonical serialization**, including emails, password hashes, branch assignments, lifecycle fields, and permissions. All other original tables match: branches 38, reports 8, items 8, report-audit rows 1, tasks 13, task updates 15, time logs 0, action tokens 0, and security events 0. No existing report status, date, amount, or audit record changed.

Read-only checks found **zero temporary-user references across all 8 discovered user foreign keys**: time logs, both task-user references, report manager, report-audit actor, action-token user, and both security-event user references. However, the instruction authorizes deletion **after all checks pass**; that prerequisite was not met. Both temporary users therefore remain ACTIVE at version 0 for review. Neither temporary password nor auth_version was subsequently changed. No existing operational user was modified. Temporary inserts may have advanced the users auto-increment counter; no attempt was made to reset it.

The following FAIL values mean the requested verification did not pass, not that every unrun feature is defective:

```text
BACKEND STARTUP: PASS
FRONTEND STARTUP: PASS
REAL MYSQL MANAGER LOGIN: FAIL (not verified)
MANAGER BRANCH ISOLATION: FAIL (not reached)
REAL MYSQL HEAD OFFICE LOGIN: FAIL (not reached)
HO OVERVIEW/REPORT/AUDIT/ANALYTICS: FAIL (not reached)
JWT AUTH_VERSION PRESENT: FAIL (not reached)
STALE JWT REJECTED AFTER VERSION CHANGE: FAIL (not reached)
RECOVERY UI WITH MAIL DISABLED: FAIL (pages not reached; mail confirmed disabled)
ORIGINAL 58 USERS PRESERVED: YES
TEMPORARY USERS REMOVED SAFELY: NO
TEST REPORTS PRESERVED: YES
BUSINESS DATA MUTATED: NO
REAL EMAIL SENT: NO
WANI ACCOUNT MODIFIED: NO
EXISTING HEAD OFFICE ACCOUNT MODIFIED: NO
COMMITTED: NO
PUSHED: NO
```

### Earlier attempt — existing credentials unavailable

Date: 2026-09-23. **BLOCKED before runtime startup: existing development login credentials unavailable.**

The supplied context contains no usable existing Manager or synthetic Head Office login credentials. A value-redacted check found no development login credential keys in the local backend/frontend environment files or process environment. The existing UI smoke script uses intercepted APIs and synthetic fixture credentials; it is not evidence of successful authentication against the migrated database. Historical/default password candidates were not tried, and no credential was reset, replaced, or generated.

Per the explicit instruction to stop if an existing development credential is unavailable, neither application server was started and no live login or recovery request was made. No database connection, migration, provisioning command, mail-provider configuration, or business mutation was performed during this attempt. No backend suite rerun was necessary because runtime verification did not begin or expose a problem. Git HEAD remains `cbf65ef`; existing implementation changes were left intact. Only this review was updated.

| Requested verification | Result |
| --- | --- |
| Backend startup | NOT RUN — credential prerequisite unavailable |
| Frontend startup | NOT RUN — stopped before startup |
| Existing Manager fresh login | BLOCKED — existing credentials unavailable |
| Manager branch context, report/history, branch isolation and HO denial | NOT RUN |
| Existing Head Office fresh login | BLOCKED — existing credentials unavailable |
| HO overview/report/audit/analytics | NOT RUN |
| JWT auth_version/current database identity enforcement | NOT RUN |
| Recovery pages with mail disabled | NOT RUN; no recovery request or token generated |
| Test reports preserved | YES — this attempt performed no database operations; no new before/after snapshot verification |
| Real email sent | NO |
| Wani account modified | NO |
| Head Office account modified | NO |
| Live business data mutated | NO |
| Committed | NO |
| Pushed | NO |

No PASS/FAIL runtime result is claimed for checks that could not run. The prior completed migration verification remains unchanged. Resume runtime verification only when existing development credentials are available securely, without placing passwords or tokens in this review or conversation. No server was started by this attempt, so none required shutdown.

## Development database migration execution

Execution date: 2026-09-23. Scope: the **current development database only**, under the user's explicit follow-up authorization. This section supersedes the earlier pending-migration status; it does not authorize production deployment, account provisioning, mail delivery or business-data cleanup.

### Git state and writer shutdown

Confirmed HEAD remained `cbf65ef redesign manager and head office workspaces`. The working tree contained the expected, reviewed, uncommitted Phase 5D code/tests/documentation plus the preceding account-model assessment. No unexpected source changes were found. No commit, push, branch switch or history operation was performed.

Elevated read-only Windows process/listener inspection found no node/nodemon backend process and no backend listener on port 5000. Initial checks also found no frontend listener on port 5173. Database session inspection found no other client session, excluding the inspector itself and an idle daemon. A second process/listener and database-session check immediately before applying confirmed no writers. No application needed to be killed; none was restarted for this task.

Windows sandbox restrictions required elevation for process inspection, backup ACL setup, writing protected backup evidence and launching mysqldump. These were task-authorized operations, not approval-review rejections. No credentials or process command lines were printed.

### Protected full backup evidence

Backup created before migration:

```text
Path: C:\Users\khush\OneDrive\Desktop\bank\.database-backups\phase5d-20260923\database-before.sql
Size: 35,791 bytes
SHA-256: cf528445cfeae32103bd7baa233baaf6684d150dcc9e843f33612f334cc77f26
```

Used the same installed MySQL 8.0 mysqldump approach as Phase 1: full schema/data, single-transaction, quick, routines/events/triggers, hex-blob, no tablespaces, GTID-purged off, no added table locks or DROP TABLE statements. A temporary client option file supplied credentials without password command-line arguments. Its removal and absence were verified. Raw dump contents, password hashes and provider/database secrets were never printed.

The new backup directory is under the existing `.database-backups/` Git ignore; `git check-ignore` confirmed the SQL backup is ignored. Directory inheritance was disabled and access restricted to the current Windows user, SYSTEM and Administrators. Backup files inherit that protection. No backup was written outside this location.

Verification checked nonempty output, CREATE TABLE sections for all eight original tables, INSERT sections for every populated table and the dump completion marker. An independent PowerShell SHA-256 calculation matched the recorded digest. No restore test was performed; this is a verified dump with a restore-test limitation, as in Phase 1.

Ignored local evidence includes `before.json`, `recheck.json`, `after.json`, `backup-proof.json` and `verify.cjs`. Preservation snapshots contain schema/counts and canonical whole-table fingerprints, not raw user/report rows. Row values were compared through in-memory hashing. The backup itself necessarily contains the full private database and remains protected/ignored.

### Before inspection and reviewed-plan comparison

After backup, ran the requested command from `Bank-backend`:

```powershell
node scripts/phase5d-migration.js --inspect
```

| Finding | Result |
| --- | --- |
| Existing users | 58 |
| Previously active -> ACTIVE | 38 (37 Managers, 1 Head Office) |
| Previously inactive -> DISABLED | 20 (legacy Employees) |
| Invalid active flags | 0 |
| Invalid active bcrypt encodings | 0 |
| Blocked findings | None |
| Planned statements | 7: six DDL statements and one users.account_state mapping UPDATE |
| Current fingerprint | `9d13b0a29c9d5875d17abec251a7fd07e991e6767ee5b339761243fdd69f9a8e` |

The seven statements were compared programmatically, in order and with whitespace normalized, against the exact SQL block in this review. They matched. The fingerprint also matched the original reviewed fingerprint. No unexpected schema/data finding occurred. Pre-backup and immediate pre-apply fingerprints matched for every original row and schema in all eight original tables.

A task-local helper initially represented aggregate counts as strings because of its driver options, producing a local serialization mismatch. It was aligned with the migration tool's numeric settings before capturing evidence; the actual inspector then matched the reviewed plan exactly. This was a helper representation issue, not a database finding or migration attempt. No SQL mutation was performed during these checks.

### Applied fingerprint and migration result

Executed exactly once:

```powershell
node scripts/phase5d-migration.js --apply --reviewed-plan 9d13b0a29c9d5875d17abec251a7fd07e991e6767ee5b339761243fdd69f9a8e --backup-confirmed --writers-stopped
```

Exit code: **0**. All seven reviewed statements completed, including the script's post-migration inspection. No substitute/manual DDL, retry, cleanup, restore or account operation was executed.

Only the authorized credential schema and existing-user lifecycle mapping were applied. Existing emails, hashes, role/branch assignments and business records were preserved. MySQL's implicit DDL commits remain relevant to future rollback planning; no rollback was required here.

### After inspection and schema verification

Ran `node scripts/phase5d-migration.js --inspect` again:

```text
users: 58
active flag count: 38
inactive flag count: 20
blocked findings: none
planned statements: 0
post-migration empty-plan fingerprint:
595cc94fdcc5eb5f91f938ce4a64e040390817a136081abd5a9367411a9a8a1a
```

The inspector's fixed footer says `CURRENT DEVELOPMENT DB MIGRATED: NO` even after a successful migration because inspect mode never performs migration itself. That footer is misleading as a database-status label; the empty plan and independently inspected schema establish that the development database **is migrated**. Application/tool source was not changed during this execution task.

Verified the three new user columns:

| Column | Live definition |
| --- | --- |
| account_state | enum('INVITED','ACTIVE','DISABLED'), NOT NULL, default INVITED |
| auth_version | int unsigned, NOT NULL, default 0 |
| password_changed_at | datetime(6), NULL, default NULL |

Both new InnoDB tables exist and are empty. The migration inspector validated their full expected column definitions and restrictive user relationships. Independent information_schema checks confirmed:

- `account_action_tokens`: PRIMARY(id), UNIQUE token_hash(token_hash), user_purpose(user_id,purpose), expires_at(expires_at); `phase5d_token_user_fk` to users with UPDATE/DELETE RESTRICT.
- `account_security_events`: PRIMARY(id), subject_timeline(subject_user_id,created_at), actor(actor_user_id); `phase5d_event_subject_fk` and `phase5d_event_actor_fk` to users, both UPDATE/DELETE RESTRICT.
- All original non-user table schemas remain identical. No business report/item/report-audit schema was altered.

### Existing-user preservation

Whole-table canonical fingerprints of **all original users columns** matched before and after. This covers user IDs, emails, password hashes, names, roles, branch IDs/codes/names, active flags and legacy permission/person fields. No individual hash or raw user row was printed.

A separate per-user expected-state fingerprint confirmed every previously active user became ACTIVE and every previously inactive user became DISABLED. All 58 users have `auth_version=0` and `password_changed_at=NULL`; no historical password-change timestamp was fabricated. No invitation or security-event row was created.

The Wani and Head Office identities/credentials were not specifically modified, provisioned or transitioned. They received only the same authorized new lifecycle metadata as other existing users. The Administrative Office's pre-existing contact-email mismatch remains untouched.

### Business-data preservation

| Original table | Before | After | Original rows and schema |
| --- | ---: | ---: | --- |
| branches | 38 | 38 | Identical |
| users | 58 | 58 | All original fields identical; only authorized new columns added/mapped |
| daily_business_entries | 8 | 8 | Identical |
| daily_business_items | 8 | 8 | Identical |
| daily_business_audit_logs | 1 | 1 | Identical |
| tasks | 13 | 13 | Identical |
| task_updates | 15 | 15 | Identical |
| time_logs | 0 | 0 | Identical |

Report fingerprints include every original field, so status, amount, business date, creator, timestamps, correction flags/reasons and other report metadata are unchanged. Item and report-audit fingerprints also match in full. No test report was deleted, normalized, edited, submitted or finalized.

### Post-migration regression results

| Requested check | Result |
| --- | --- |
| Complete backend suite | **337 passed, 0 failed, 0 skipped** |
| Backend JS syntax | **40 files passed** |
| Frontend operations + credential helpers | **11 passed, 0 failed** |
| Frontend lint | **Passed, 0 errors/warnings** |
| Frontend production build | **Passed, 122 modules** |
| git diff --check | **Passed**; only normal LF/CRLF notices |

Build output: JS 315.13 kB / 101.29 kB gzip; CSS 25.10 / 5.93 kB; HTML 0.46 / 0.29 kB; existing logo 9.44 kB. Tests use synthetic in-memory database/mail fixtures and loopback servers, not live account or business operations. No browser/mailbox workflow or real login was needed for this migration verification.

### Execution stopping point

This execution updated only this review and created ignored protected backup/verification artifacts. No application code was changed during execution. HEAD remains `cbf65ef`; the previously reviewed Phase 5D implementation is still uncommitted. Existing versionless JWTs will require a fresh login when the updated backend is started; starting/deploying it was not part of this task.

No branch-account command, real mail transport, Wani provisioning, Head Office transition, email conversion, data cleanup, deployment, commit or push was performed. Work stops after migration verification. Any Wani mailbox pilot remains separately authorized work.

CURRENT DEVELOPMENT DB MIGRATED: YES
BACKUP VERIFIED BEFORE MIGRATION: YES
EXISTING USERS PRESERVED: YES
EXISTING EMAILS CHANGED: NO
EXISTING PASSWORD HASHES CHANGED: NO
TEST REPORTS PRESERVED: YES
BUSINESS DATA MUTATED: NO
WANI ACCOUNT MODIFIED: NO
REAL EMAIL SENT: NO
HEAD OFFICE ACCOUNT MODIFIED: NO
BACKEND TESTS PASS: YES
FRONTEND TEST/LINT/BUILD PASS: YES
COMMITTED: NO
PUSHED: NO
