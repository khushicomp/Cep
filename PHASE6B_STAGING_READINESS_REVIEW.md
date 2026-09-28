# Phase 6B — Staging deployment readiness implementation

## Scope and baseline

Starting branch: `phase1-hardening`. Starting and final HEAD: `b6b09303aa4259b5e514ac3535f5e7dac21943cd` — `add secure Resend credential mail transport`. The working tree was clean before implementation. The changes listed below are the authorized Phase 6B work, including work resumed after interruption; nothing has been staged, committed or pushed.

This is implementation and offline verification, not deployment approval. No application was started against the development database, and no live migration, seed or account operation was executed. Historical review documents and schema-only CREATE TABLE definitions from the protected existing backup informed the canonical schema; no backup rows or credentials were copied into it. The Phase 6A request and findings stated in the Phase 6B request were considered; there is no separate Phase 6A assessment file in this checkout.

## Runtime version

`.nvmrc`, both package manifests, and their lockfile root entries pin Node **24.21.0** consistently. This is an LTS release and satisfies the locked Vite requirement; it supports the SQLite-based tests. See the [official Node release](https://nodejs.org/en/blog/release/v24.21.0).

The available local executable is **Node 23.7.0**. All results below were obtained with that executable, not the deployment pin. No Node installation or dependency upgrade was performed. Running the same checks under 24.21.0 remains a pre-deployment requirement. Dependency versions were not changed.

## Database connections and TLS

`config/database-options.js` supplies runtime pool options and standalone connections used by both supported historical migration CLIs and the new schema/seed tools. No tool is imported for execution during startup. The existing callback/promise pool interfaces remain available.

`DB_SSL_MODE=disabled` permits existing local development configuration. `DB_SSL_MODE=verify` requires a parseable PEM CA certificate bundle in `DB_SSL_CA` and a syntactically valid DNS hostname. IP literals, malformed trust material, private-key material, unknown modes, and attempts to override certificate/identity verification fail with fixed configuration errors. Staging (`DEPLOYMENT_ENV=staging`) and production (`NODE_ENV=production`) require verified TLS. No plaintext fallback occurs.

Verified options explicitly set both `rejectUnauthorized: true` and mysql2's `verifyIdentity: true`. The installed mysql2 implementation was inspected to confirm that the latter enables hostname verification. No actual CA, hostname, password or connection string was added. These tests prove configuration construction, not a real TLS handshake with Aiven.

Connection initialization is bounded at ten seconds. The pool withholds each newly acquired connection until its session timezone initialization succeeds; initialization failure destroys it and returns a sanitized error. Successful connections initialize once. Standalone connections apply the same session setting before returning to callers. Multiple SQL statements remain disabled.

## Timezone compatibility

The Phase 4B review records an India Standard Time database session and India-local audit display. Reports bind JavaScript Date values into `submitted_at DATETIME`; audit timestamps use MySQL TIMESTAMP and are formatted in SQL as local calendar strings. Forcing a UTC session would change the audit display convention.

The explicit policy therefore preserves the existing semantics: driver timezone and session `time_zone` are **+05:30**. `DB_TIMEZONE` may be omitted or set to exactly `+05:30`; other values fail closed. Report entry dates remain calendar labels calculated with `Asia/Kolkata`. No existing value is rewritten or reinterpreted as UTC.

Credential issuance, expiration, consumption, password-change timestamps and security events retain their existing explicit `UTC_TIMESTAMP(6)` SQL expressions and UTC comparisons. Those DATETIME values are not converted into business-local timestamps. Tests exercise India midnight, driver Date serialization and representative offset round trips under UTC, Asia/Kolkata and America/Los_Angeles host settings, plus exclusive credential expiry at the UTC deadline in the isolated credential fixture. These are offline tests, not a MySQL temporal round-trip integration test.

## Canonical schema and bootstrap

The complete executable definition is [current-schema.sql](Bank-backend/scripts/current-schema.sql). It represents **seven tables, 83 columns**, InnoDB, `utf8mb4_0900_ai_ci`, targeting MySQL 8. The actual audit table name is **daily_business_audit_logs**, not `report_audit_logs`.

| Table | Columns | Principal constraints and indexes |
| --- | ---: | --- |
| branches | 14 | Integer auto-increment branch PK; unique branch code; reviewed branch metadata and timestamp defaults |
| users | 18 | Integer auto-increment user PK; unique email; branch FK; existing role enum and permission columns; account_state enum INVITED/ACTIVE/DISABLED, unsigned auth_version default 0, nullable password_changed_at DATETIME(6) |
| daily_business_entries | 15 | Integer auto-increment PK; unique branch/date; restrictive branch and manager FKs; DATE business label; DECIMAL(15,2) amount; existing varchar status/default; submission DATETIME and correction fields |
| daily_business_items | 7 | Integer auto-increment PK; entry index/FK with existing DELETE CASCADE; serial/type/status/DECIMAL amount/remark |
| daily_business_audit_logs | 13 | Integer auto-increment PK; indexed restrictive entry/branch/actor FKs; actor snapshots, JSON state snapshots, optional reason/network metadata, TIMESTAMP default |
| account_action_tokens | 9 | Unsigned bigint PK; restrictive user FK; SETUP/RESET enum; unique BINARY(32) digest; unsigned version; UTC-capable DATETIME(6) timestamps; user/purpose and expiry indexes |
| account_security_events | 7 | Unsigned bigint PK; restrictive subject/nullable actor FKs; source/reference/action and DATETIME(6); subject/time and actor indexes |

All column definitions, nullability, defaults, PKs, unique/index definitions and FK actions are in the SQL file. Report status stays VARCHAR(50), including its existing lowercase default; lifecycle transitions remain enforced by the current application. The bootstrap does not introduce a new status enum or remove historical role values. It contains no data, auto-increment counters from development, legacy task tables, default credentials or FK-check bypasses.

The tool defaults to metadata inspection. It refuses any nonempty database, including views, routines, triggers or events. Apply requires the exact reviewed schema fingerprint and an explicit empty-database acknowledgement, obtains an advisory initialization lock, rechecks emptiness, executes seven CREATE statements in dependency order, and independently validates the result. MySQL DDL is not transactional: partial failure must be inspected, and a rerun refuses the now-nonempty database. Quiesce other writers and use a dedicated empty target; the advisory lock coordinates these tools, not arbitrary external clients.

Current fingerprint:

`bb0bea8dec3ac12568fe051837d918805dcac644a7b77cb12ad01f12a5048bf5`

Future operator commands, from `Bank-backend`, **not executed in Phase 6B**:

```text
node scripts/current-schema.js --inspect
node scripts/current-schema.js --apply --empty-database-confirmed --reviewed-schema <current-inspected-fingerprint>
node scripts/current-schema.js --validate
```

These commands use configured target credentials. The schema CLI can load the backend .env for compatibility; explicitly supply the isolated staging configuration rather than running it with development defaults. No script creates a database or cloud resource.

## Independent schema validation and migration compatibility

`--validate` uses read-only information_schema queries to verify tables/engines/collations, every column's type/nullability/default/extra attributes, primary/unique/required indexes and restrictive or cascading FK relationships within the same database. Unexpected columns, tables, checks, triggers, routines and events require review. It does not repair drift or dump user/business rows. Metadata must be fully visible to the operator account; restricted metadata permissions are not a substitute for a valid empty target.

The canonical SQL is the source for the expected manifest; validation compares that manifest to separately queried metadata. Synthetic tests perturb types, defaults, nullability, generated attributes, keys, referential actions, schemas, engines and extra objects. They also run the existing Phase 1 and Phase 5D planners against canonical metadata: both produce **zero blocked findings and zero steps**, without weakening either planner's guards. Their only runtime changes are shared connection initialization.

Actual MySQL execution and post-bootstrap metadata validation remain required in a separately authorized isolated staging environment. Mock metadata tests do not prove provider-specific DDL support or concurrency.

## Synthetic staging seed

`scripts/staging-seed.js` is a separate operator CLI, defaults to inspection, and deliberately does not load the development .env. It requires `DEPLOYMENT_ENV=staging`, `NODE_ENV=development` (operator mode only), and `CREDENTIAL_MAIL_TRANSPORT=disabled`. It refuses production mode. The application deployment itself should use NODE_ENV=production.

The seed requires the validated current schema and **all seven tables empty**. It creates 38 unmistakably synthetic branch labels with stable IDs 1–38 and codes AUCB001–AUCB038. Branch 1 retains the Administrative Office type. Two synthetic Managers use branches 3 and 4; one synthetic Head Office identity uses branch 1. All three mailbox identifiers use `example.invalid`. No real branch address/contact data, Wani identity, operational mailbox or existing account is copied. This is a fictional branch catalogue for isolation testing, not provisioning of the bank's real branch accounts.

Passwords must be supplied through protected process environment input, separately for each identity: `STAGING_MANAGER_A_PASSWORD`, `STAGING_MANAGER_B_PASSWORD`, `STAGING_HEAD_OFFICE_PASSWORD`. Apply requires three distinct values, at least 20 characters, no more than 72 UTF-8 bytes, and sufficient character diversity. There is no committed default or plaintext output. The tool bcrypt-hashes them at cost 12 and inserts ACTIVE, version-0 synthetic identities directly for authenticated smoke tests. It neither creates setup tokens nor invokes account provisioning/mail services. Remove operator password variables after use.

Apply uses an advisory lock and a transaction; an error rolls back inserted rows. Re-execution against populated tables refuses clearly, rather than changing passwords or overwriting users. No reports, items, audit/security events, tokens, customer data or legacy records are seeded.

Future commands, **not executed against any database in this phase**:

```text
node scripts/staging-seed.js --inspect
node scripts/staging-seed.js --apply --synthetic-empty-staging-confirmed
```

## Health and graceful shutdown

`GET /health/live` returns only HTTP 200 `{ "status": "ok" }`.

`GET /health/ready` uses a shared, coalesced probe with a two-second HTTP deadline, bounded SELECT 1, connection cleanup, and destruction of expired/late connections. It returns only 200 `{ "status": "ready" }` or 503 `{ "status": "not_ready" }`. It exposes no schema, counts, environment values or driver errors. Concurrent probes do not multiply pending acquisitions. Normal connection initialization may set session timezone but never changes stored rows.

SIGTERM/SIGINT are handled once. Shutdown stops HTTP acceptance, closes idle connections, permits a five-second request drain, forces remaining HTTP connections closed when necessary, and attempts pool closure. A ten-second total deadline bounds a hanging pool close; normal completion exits 0, errors/forced timeout exit 1. No sensitive diagnostics are emitted. The implementation is dependency-injected for tests.

## Frontend configuration, routing and headers

Both Axios clients consume the same `services/endpoint.js` value and pure URL validator. Recovery remains unauthenticated, with no session/interceptor dependency. Development may fall back to localhost; production build/runtime rejects missing configuration, non-HTTPS, local/IP hosts, credentials, query/fragment, malformed/normalized-away paths, wildcards and paths other than /api. An optional trailing slash is normalized. Vite performs validation before building.

`frontend/vercel.json` explicitly rewrites the Manager/Admin route trees and three recovery routes to index.html. Root serves index.html normally. It does not rewrite /api or arbitrary assets. The API remains separately hosted. See [Vercel's Vite routing documentation](https://vercel.com/docs/frameworks/frontend/vite).

Headers include no-referrer, nosniff, DENY/frame-ancestors none, restricted camera/microphone/geolocation/payment permissions, HTTPS HSTS without a guessed subdomain/preload policy, and no-store. The static CSP header protects framing, objects and base URLs. A production-build HTML CSP, inserted before scripts, supplies the complementary resource policy and **exact configured API origin**. Multiple policies apply together. The meta policy is necessary here because the eventual API hostname is a build setting, while the committed Vercel headers are static.

Scripts and stylesheet elements are same-origin only; no inline/eval/third-party script permission is added. Existing React layout style attributes require the narrowly scoped `style-src-attr 'unsafe-inline'`; that allowance does not apply to scripts or style elements. Images permit same-origin/data and fonts are same-origin. No analytics were added. The built HTML was inspected to confirm CSP precedes the bundled script and contains the synthetic verification API origin, not localhost. An actual browser CSP/routing check on Vercel is still necessary.

Production CORS remains exact-origin, HTTPS, Authorization-based, and without cookies. Wildcard subdomain configurations are now rejected explicitly. TRUST_PROXY remains false unless reviewed IPs/CIDRs are configured; no Render proxy range was guessed.

## Configuration examples

Backend examples add DB_SSL_MODE, DB_SSL_CA, DB_TIMEZONE, DEPLOYMENT_ENV and blank synthetic operator password inputs. Existing DB_HOST/PORT/NAME/USER/PASSWORD retain their meanings. Frontend comments explain that VITE_API_URL is public build configuration, requires the allocated HTTPS /api target for production, and drives CSP connect-src. No real .env was edited. Mail remains disabled in the example; the Phase 5E transport/message implementation is unchanged.

## Verification results

| Check | Result |
| --- | --- |
| Complete backend suite, all scripts/*.test.js with --test-isolation=none | **424 passed, 0 failed**, no skipped/cancelled tests |
| Existing backend baseline | All 374 prior tests retained; isolated mocks updated for the new module imports |
| New Phase 6B backend tests | **50 passed**, configuration/TLS/session gating, metadata/bootstrap/seed safety, migration compatibility, health/shutdown, timezone and expiry |
| Backend JS syntax | **49 files passed** node --check |
| All frontend scripts/*.test.mjs | **30 passed, 0 failed**: 11 existing and 19 new configuration/routing/CSP tests |
| Frontend lint | PASS |
| Frontend production build | PASS, **124 modules transformed** |
| git diff --check | PASS |

Build verification used only a command-scoped `VITE_API_URL=https://api.example.invalid/api`; real .env files were unchanged and no endpoint was contacted. The first build was blocked by the sandbox's esbuild child-process restriction; the authorized local build retry succeeded. The backend fixtures use mocked metadata or isolated in-memory SQLite; any test mail transport is fake. No real server was started against the development DB. Verification output is outside the repository or in already ignored build output.

## File inventory and change review

Added (14 files including this review):

- `.nvmrc`
- `Bank-backend/config/database-options.js`
- `Bank-backend/scripts/current-schema.js`
- `Bank-backend/scripts/current-schema.sql`
- `Bank-backend/scripts/staging-seed.js`
- `Bank-backend/scripts/helpers/schema-fixture.js`
- `Bank-backend/scripts/phase6b-readiness.test.js`
- `Bank-backend/services/runtime-health.js`
- `Bank-backend/services/runtime-shutdown.js`
- `frontend/src/services/endpoint.js`
- `frontend/src/utils/apiConfig.js`
- `frontend/scripts/staging-config.test.mjs`
- `frontend/vercel.json`
- `PHASE6B_STAGING_READINESS_REVIEW.md`

Modified (18 files): backend .env.example, app.js, config/db.js, config/security.js, package.json, package-lock.json, server.js; scripts/phase1-migration.js, phase1-migration.test.js, phase5a-cleanup.test.js, phase5b-security.test.js, phase5d-migration.js; frontend .env.example, package.json, package-lock.json, src/services/api.js, src/services/recoveryApi.js and vite.config.js.

Tracked-file diff before adding this report: 18 files, 63 insertions and 24 deletions. Standard git diff --stat excludes the new untracked files above. Final status intentionally contains these 18 modified and 14 untracked source/test/config/documentation files; no staged changes or commits.

The complete changed-file set was reviewed, including untracked files. The high-confidence secret/artifact scan found no private keys, JWTs, bcrypt hashes, provider keys or prohibited artifacts. Manual review found no new actual secrets, real operational mailbox assignments, database dump rows, generated passwords or setup/reset credentials. The schema SQL is source DDL, not a database dump. Synthetic passwords/hashes exist only in isolated test memory. Tracked environment files are examples only. Existing tracked images are unchanged.

`.database-backups`, both node_modules directories, real .env files and frontend/dist remain ignored. No screenshot, backup, dependency directory or build output is part of the change set. No historical credential was printed, tested or changed. The historical Git secret/default-credential issue remains a **separate pre-publication remediation decision**; this phase did not rewrite history or claim that history is clean.

## Remaining requirements before actual staging

1. Run the regression suite and build under the pinned Node 24.21.0 executable, and confirm the platforms' actual selected runtime/build versions.
2. Obtain separately authorized Aiven target details and CA bundle; verify actual certificate chain/hostname validation, server MySQL version/collation support, privileges and session behavior. Never import development data.
3. Review the exact empty target and fingerprint, then separately authorize bootstrap, read-only validation and synthetic-only seeding. Validate real MySQL temporal behavior and both migration inspectors afterward. No such execution happened here.
4. Allocate Render/Vercel hostnames under separate deployment authorization. Configure protected unique DB/JWT secrets and the exact HTTPS frontend/API origins. Supply CA as protected configuration, not source control.
5. Set final CLIENT_URL to the stable allocated frontend origin, VITE_API_URL to the allocated Render /api URL, rebuild, and inspect the resulting exact CSP connect-src. Browser-test all direct routes, recovery fragment removal, role access and CSP on the actual deployment.
6. Verify Render forwarding/proxy behavior before setting TRUST_PROXY. With false, rate limits may observe the proxy IP; do not solve that by trusting every proxy. Confirm termination grace exceeds the application's ten-second limit, health probes work and database pool capacity is suitable.
7. Keep CREDENTIAL_MAIL_TRANSPORT=disabled throughout staging bootstrap/verification. No Resend key/provider/recipient setup or Wani pilot is authorized by this phase.
8. Decide repository publication/history remediation independently. Passing this implementation review does not resolve historical exposures or authorize public publication.

Only public documentation was consulted over the network. No Aiven/database connection, provider API request, resource creation, deployment, real email, Wani/real Head Office operation or local business-data mutation occurred. SAFE TO COMMIT below means the reviewed implementation is suitable for a later separately authorized commit; it is not a claim of deployed integration verification.

PHASE 6B IMPLEMENTATION COMPLETE: YES
FULL REGRESSION PASS: YES
SAFE TO COMMIT: YES
AIVEN CONTACTED: NO
RENDER DEPLOYED: NO
VERCEL DEPLOYED: NO
RESEND CONTACTED: NO
REAL EMAIL SENT: NO
LOCAL BUSINESS DB MUTATED: NO
WANI TOUCHED: NO
REAL HEAD OFFICE TOUCHED: NO
COMMITTED: NO
PUSHED: NO
READY FOR PHASE 6B REVIEW: YES
