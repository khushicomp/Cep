# Phase 5B: Production security hardening

Implemented on 2026-09-21. Scope is authentication and configuration hardening of the existing Manager/Head Office reporting application. No UI redesign, report lifecycle changes, deployment, migrations, live data changes, commit, or push.

## Preflight and verification

Initial `git status --short` was empty. Phase 5A was committed at `62371a6` (`remove legacy task workflows and clean repository`). The six initial commits were `62371a6`, `534f493`, `419f92d`, `9c42cb2`, `344a471`, `80082a0`.

| Check | Before changes | After changes |
| --- | --- | --- |
| Complete backend suite | 238 passed, 0 failed | 283 passed, 0 failed, 0 skipped |
| Backend JavaScript syntax | 25 files passed | 28 files passed |
| Frontend ESLint | 0 errors, 0 warnings | 0 errors, 0 warnings |
| Frontend production build | Passed, 111 modules | Passed, 111 modules |
| JavaScript bundle | 308.47 kB / 98.82 kB gzip | 308.47 kB / 98.82 kB gzip |
| CSS bundle | 30.98 kB / 6.62 kB gzip | 30.98 kB / 6.62 kB gzip |
| `git diff --check` | Passed | Passed |

Tests run from `Bank-backend` using all `scripts/*.test.js` with `node --test --test-isolation=none`. Node's subprocess test isolation was blocked by the sandbox; the existing no-isolation mode passed. The Vite/esbuild build required execution outside the sandbox because of a child-process EPERM restriction; both baseline and final builds passed. Git emits LF/CRLF normalization notices, not whitespace errors. No lint rules or existing business assertions were disabled.

## Threat model and assessment

| Threat | Initial status | Result / remaining responsibility |
| --- | --- | --- |
| Credential brute force | Exposed: no login throttle | Added bounded per-IP login limiter. Distributed attacks and shared NAT remain limitations. |
| Stolen JWT | Partially mitigated by signature and expiry | Ten-hour lifetime retained; current disabled/deleted accounts denied. Local logout does not revoke a stolen token. |
| Weak/default JWT secret | Exposed production configuration gap | Startup rejects missing, short, simple repeated, low-diversity and known-placeholder secrets in production. Operators must generate random secrets. |
| Stale role/branch claims | Exposed until token expiry | Current identity, role, branch and active flag read from DB on each authenticated request. |
| Cross-branch IDOR | Already mitigated | Existing manager branch-scoped SQL, service checks and cross-branch 404 behavior retained and tested with reassignment. |
| Role escalation | Partially mitigated: signed but stale claims | HS256 verification plus current DB role and existing route/service role allowlists. Client role metadata is never authoritative. |
| SQL injection | Already mitigated in reviewed runtime paths | Bound parameters retained; dynamic predicates derive from server-controlled role/filter choices, not arbitrary client SQL. |
| XSS / token theft | Partially mitigated | React text rendering and safe toast DOM retained; no active untrusted HTML sinks found. LocalStorage remains accessible to any successful same-origin script injection. |
| Excessive JSON bodies | Default limit existed, not tailored | Explicit 16 KiB login / 1 MiB business limits. Edge request/header/time limits remain deployment work. |
| Permissive CORS | Partial: configured origin list but production fallback and unnecessary credentials | Explicit exact HTTPS origins required in production; unexpected origins denied; cookie credentials disabled. |
| Sensitive errors/logging | Mostly mitigated | Existing generic business errors retained; authentication exceptions and identity lookup failures also generic. No payload/token/hash logging added. |
| Unsafe production config | Exposed validation gap | Startup validates critical env values, ports, origins and explicit proxy ranges before route/DB imports. TLS/network/secret management remain operational. |
| Seeded/default credentials | Current runtime seeds removed in Phase 5A; historical risk remains | Credential-like historical material found. Controlled provisioning and credential rotation are required before production. |
| Destructive historical utilities | Already gated in Phase 5A | Gates retained and covered by regression tests; utilities are not production migration tooling. |

This is a source/configuration review with isolated tests, not a penetration test or attestation of existing database password contents or deployed infrastructure.

## Changed files

| File | Purpose |
| --- | --- |
| `Bank-backend/config/security.js` (new) | Environment validation and CORS policy. |
| `Bank-backend/middleware/login-limit.middleware.js` (new) | Narrow login limiter factory. |
| `Bank-backend/app.js` | Startup validation, explicit trust proxy, reviewed Helmet settings, CORS, no-store and body parser placement. |
| `Bank-backend/routes/auth.routes.js` | Login limiter before its 16 KiB JSON parser and controller. |
| `Bank-backend/controllers/auth.controller.js` | Explicit user columns, generic failures, input shape bounds, dummy bcrypt comparison and safe error handling. |
| `Bank-backend/middleware/auth.middleware.js` | Strict bearer/HS256 verification and authoritative current identity lookup. |
| `Bank-backend/package.json`, `package-lock.json` | Exact `express-rate-limit@8.7.0`; new transitive `ip-address@10.7.2`. |
| `Bank-backend/scripts/helpers/report-fixture.js` | Inject isolated current-identity lookup; support identities differing from signed claims. |
| `Bank-backend/scripts/phase5a-cleanup.test.js` | Update app mock for configuration/set/disable APIs; preserve route-removal assertions. |
| `Bank-backend/scripts/phase5b-security.test.js` (new) | 45 focused security checks. |
| `Bank-backend/.env.example`, `frontend/.env.example` (new) | Placeholder-only environment guidance. |
| `PHASE5B_REVIEW.md` (new) | Assessment, evidence, production contract and manual checklist. |

Frontend application code and report/audit services are unchanged. Real local `.env` files were not edited or exposed. Dependencies were installed locally with scripts/audit/funding disabled during installation; audits ran separately. No broad dependency upgrade or audit fix was performed.

## Authentication architecture and session decision

Before: login issued a ten-hour signed JWT containing user ID, role, branch and branch metadata. Protected requests trusted the decoded role/branch for the token's entire lifetime.

After: token signature, algorithm (HS256), expiry and bounded positive user ID are verified first. A parameterized `SELECT user_id, role, branch_id, is_active FROM users WHERE user_id = ?` reads current authority on each protected request. Only user ID, role and branch ID are attached to `req.user`. Missing/disabled users and unsupported roles return 401. Invalid signatures/expiry/formats also return 401. Missing Authorization retains the existing 403 contract. Identity DB failure returns generic 503 and grants no access.

Existing role/branch claims remain in newly issued JWTs for response compatibility, but cannot authorize requests. Role changes and branch reassignments apply on the next request without waiting ten hours. There is no cache. This adds one narrow DB query per protected request and a DB availability dependency. Authorization is a request-time snapshot, not a lock preventing administrative changes during an already-running request.

Manager branch isolation and Head Office permissions remain enforced in the existing routes and services. Transitional ADMIN central-read compatibility remains; ADMIN gains no final-lock permission. EMPLOYEE compatibility does not recreate a workspace. Audit actor names still come from the existing transaction's narrow name lookup.

Retained the existing ten-hour bearer/localStorage session model for a working-day application. No refresh token, cookie, session table or revocation mechanism was added. JWT data is signed, not encrypted. Keep sensitive data out of claims. LocalStorage remains exposed to same-origin XSS; logout only removes local token/role/user state. Password changes alone do not invalidate already-issued JWTs. Disabling/deleting a user blocks subsequent authenticated requests; secret rotation invalidates all tokens signed with that key. Re-enabling an account can make an unexpired token usable again.

Frontend logout clears all three session keys. The API helper clears them and redirects to login on 401. Route role metadata is UI state only and can remain stale after reassignment; logging in again refreshes it. Existing 403 permission denial does not force logout, and temporary 503 identity lookup failure does not clear the session. Isolated tests exercise the actual session helper/interceptor.

## Login throttling, enumeration and passwords

`POST /api/auth/login` allows 30 attempts per client IP per five-minute window, counting successes and failures. Excess returns 429 with `Too many login attempts. Please try again later.`, RateLimit headers and Retry-After. The limiter runs before login JSON parsing and bcrypt. Business endpoints are unaffected. The maintained [express-rate-limit package](https://github.com/express-rate-limit/express-rate-limit) supplies IPv6-aware default IP handling and an in-process memory store.

Limits are per process and reset on restart. Multiple replicas require a shared supported store or an edge/global limit before deployment. IP-only limits cannot stop distributed credential stuffing; shared office NAT can throttle multiple legitimate users together. There is no account lockout or schema change. Monitor and tune for actual office traffic before rollout. A reverse proxy must overwrite untrusted forwarding headers; configure only the real proxy addresses. Blank TRUST_PROXY trusts none; never use a blanket `true` or hop-count assumption.

Unknown email, wrong password and disabled account now receive identical 401 `Invalid credentials` responses. Missing/invalid input receives that same generic failure. An unknown account performs a synthetic cost-12 bcrypt comparison instead of an immediate no-comparison exit. This reduces the cheap timing distinction but is not a claim of constant network timing: existing hash costs and query timing may differ. No account-specific lockout/status information is exposed.

Existing `bcryptjs.compare` verification is retained, and successful login returns a safe user allowlist. Password hashes are retrieved only for login verification, never attached to `req.user`, tokens, public responses or logs. Current runtime has no account creation/password storage endpoint, so it cannot write plaintext/default account passwords. Existing stored hashes/costs were not inspected; their quality cannot be certified by this change. Bcrypt's input-length semantics still apply; a future controlled provisioning process must account for its 72-byte limit and use unique strong passwords with an appropriate cost. The login input cap is a resource bound, not a new password policy.

There is no production-ready account provisioning/reset workflow. Establish a separately reviewed process using bcrypt hashes, unique credentials, secure delivery, least-privilege roles/branch assignments and lifecycle management. Do not revive old seed scripts. No existing users or passwords were changed.

## HTTP headers, CORS and request limits

Helmet was already installed. Retained its CSP and standard cross-origin policies on API responses; verified `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, CSP, and production HSTS. Referrer policy is now explicitly `no-referrer`; `X-Powered-By` is disabled. Production HSTS is one year with includeSubDomains; development HSTS is disabled. Responses are marked no-store to avoid caching authenticated report/login data. CORS-denied responses occur before no-store and contain only a generic error.

The API does not serve the React frontend. Its CSP does not protect a separately hosted frontend document. Configure/test frontend CSP, frame policy, HTTPS/HSTS and asset behavior on the actual frontend host/reverse proxy; ensure subdomains support HTTPS before sending includeSubDomains there. No frontend HTML policy was introduced that could break existing UI assets.

CLIENT_URL is a comma-separated list of exact allowed origins. Production requires HTTPS and at least one origin; paths, trailing slashes, wildcards and missing configuration are rejected. Unknown browser origins get generic 403 without an allow-origin header. Requests without Origin intentionally proceed for server/non-browser clients, still subject to authentication. CORS grants no authorization and does not stop non-browser attackers. Cookie credentials are disabled because the app uses Authorization bearer headers. Authorization/Content-Type and current API HTTP methods are allowed.

Login JSON is limited to 16 KiB; business JSON to 1 MiB to accommodate structured report rows. Oversized bodies return generic 413; malformed JSON returns generic 400. Business-field/date/ID validation remains authoritative. Configure network/proxy timeouts and non-JSON/request/header limits at deployment; JSON limits alone are not complete denial-of-service protection.

## SQL, XSS and error/logging review

Reviewed current authentication, report mutation/read, analytics, daily overview and audit-history SQL. User emails, IDs, dates, branch filters and report values use bound parameters. Dynamic where/insert segments are selected by server-owned role/action/filter logic; no arbitrary client identifier/order fragment was found. Existing transactional/branch predicates remain unchanged. No SQL rewrites were needed beyond narrow explicit authentication column selection.

Frontend review found no runtime `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML` or `document.write` sink rendering untrusted content. Existing safe toast text/DOM construction and React text rendering handle correction/audit reasons and branch/report text. No untrusted executable URL construction was identified in reviewed flows. Existing hostile-toast rendering regression remains passing; no sanitizer dependency was added.

Runtime errors return generic client messages rather than SQL, stack, environment or driver details. Authentication logs distinguish query, processing and identity-lookup failures using fixed labels, without logging request bodies, Authorization, JWTs, hashes or credentials. Existing business/global generic errors remain. Production logging and reverse-proxy telemetry must likewise redact sensitive headers/bodies; this phase does not configure external infrastructure.

## Production environment contract

Startup validates immediately after dotenv loading and before route/database imports. Set NODE_ENV explicitly in the deployment process: absent NODE_ENV remains development for local usability. There is no JWT fallback in any mode. Do not copy the development example unchanged into production.

| Variable | Contract |
| --- | --- |
| `NODE_ENV` | `production` for production; otherwise `development` or `test`. Unknown values rejected. |
| `JWT_SECRET` | Production requires at least 64 characters, at least 12 distinct characters, no known placeholder markers or simple repeated blocks. Generate at least 32 random bytes encoded as 64 hex characters in a secret manager. Heuristics cannot prove entropy. Never reuse history/example credentials. |
| `DB_HOST` | Required nonempty production database hostname/address. |
| `DB_USER` | Required nonempty least-privilege production DB account. |
| `DB_PASSWORD` | Required nonempty production credential, supplied securely. |
| `DB_NAME` | Required nonempty production database name. |
| `DB_PORT` | Optional; defaults to 3306. Explicit values must be integers 1-65535. |
| `CLIENT_URL` | Required production exact HTTPS frontend origin(s), comma-separated without paths/trailing slash. Development default is `http://localhost:5173`. |
| `PORT` | Optional; defaults to 5000. Explicit values must be integers 1-65535. |
| `TRUST_PROXY` | Optional, blank means false. Explicit IP addresses or restricted IPv4/IPv6 CIDRs only, matching actual topology. No `true`, hop counts or `/0`. |
| `VITE_API_URL` | Frontend build-time API URL, including `/api`; use the real HTTPS API endpoint. Never put credentials in VITE variables. Existing localhost fallback remains for development; deployment must supply this value. |

Use a secret manager, HTTPS termination, private/secured DB connectivity and backups. The current DB client does not configure TLS certificates; decide secure DB transport/network isolation explicitly during deployment. No production credentials were generated, rotated or printed here.

## Utilities, dependencies and Git history

Reviewed the three retained historical gates (`migrations.js`, `setup_branches.js`, `setup_db_business.js`). They throw before env/DB imports unless invoked directly with `--allow-historical-schema-write`. Ordinary import, tests and `npm start` do not execute destructive SQL. The current runtime mounts only auth/business routes; setup/seed utilities are not imported. Existing gate tests remain intact. The gate is an accidental-execution barrier, not a sandbox against a deliberately authorized dangerous invocation. Do not use these scripts as production migration tooling; see `Bank-backend/DATABASE_UTILITIES.md`. No utility/migration/seed was executed.

Read-only `npm audit --json --ignore-scripts` completed for backend and frontend before changes and for backend after installing the limiter. All report zero info/low/moderate/high/critical vulnerabilities. There are therefore no reported direct/transitive or runtime/dev findings to defer. This is registry-advisory evidence, not a guarantee against undisclosed vulnerabilities. Only the direct runtime limiter and its new transitive IP parser were added; frontend dependencies are unchanged. No `npm audit fix` or breaking upgrades.

Safe, bounded history searches captured historical blobs internally and emitted only commit/path/category matches, never values:

- `bee1a68`, `Bank-backend/.env`: historical nonempty secret assignments (JWT/database credential category). Later removal is recorded at `6a79a0c`; removal does not invalidate credentials.
- `80082a0`, `7570fcb`, `a10d727`: `Bank-backend/seed_test_users.js`, hardcoded credential candidates.
- `80082a0`, `a10d727`: `Bank-backend/scripts/seed-all-users.js`, seed/default credential candidates.
- `80082a0`, `bee1a68`: `frontend/hash.js`, historical hardcoded credential candidates.

Treat any usable historical secret or seeded/default account password as exposed. Arrange rotation of affected database/JWT credentials and replacement/disablement of default credentials through a controlled process before production. Current credential equality/validity was not tested. This targeted filename/pattern scan is not an exhaustive full-history secret audit. No secret values are included here; no real credentials/accounts were rotated, no history was rewritten. Any history-cleanup decision is separate and does not substitute for rotation.

## Added tests and database activity

The 45 new tests cover production configuration rejection/acceptance and startup ordering; current identity projection; malformed/expired/wrong-signature/wrong-algorithm JWTs; missing/disabled/invalid-role users; DB failure; stale Head Office demotion and manager branch reassignment; generic login semantics and dummy comparison; successful ten-hour tokens; malformed login input; frontend session clearing/401 redirect; real login route throttling and forwarded-header spoofing; app CORS/headers/generic errors; distinct parser limits and malformed JSON.

All 238 earlier branch isolation, lifecycle, transaction, total, final-lock, correction, audit, overview, analytics, history, XSS and cleanup assertions still pass. The fixture now provides current identity separately from signed claims rather than weakening authorization checks.

New HTTP integration checks use ephemeral loopback servers, synthetic credentials, mocked DB identities/controllers and fresh in-memory limiter stores. No external server, live DB, sleep, or window-expiration timing dependency is involved. Earlier tests use existing synthetic/in-memory fixtures; the application import test confirms no DB connection is opened. Live development DB reads/writes, migrations, seeds and schema changes: none.

## Manual browser checklist (not performed by the agent)

Use existing accounts and reports; no report mutations are required.

- Manager: login; open reporting dashboard, existing report and audit history; refresh with a valid token; logout and login again. Verify no regression in branch-specific views.
- Manager session failure: in a disposable/private browser session replace its local token with `invalid`, then open/refresh a protected report. The first API 401 should clear token/role/user and return to login. Re-login afterward. Expiry is also proven by an isolated test; do not change system clocks or production secrets to simulate it.
- Head Office: login; inspect daily overview, existing report detail, analytics and audit history; logout/login. Do not click submit, final lock or correction mutations for this check.
- Rate limiting: preferably run `node --test --test-isolation=none scripts/phase5b-security.test.js` from `Bank-backend`; its independent store demonstrates 429 without affecting your running server or account. For an optional local-only HTTP check, use a separately started development instance and 31 dummy login attempts within five minutes. Never put a real password in the test. That instance/IP may be throttled for up to five minutes; stop the disposable instance afterward. Avoid testing on a shared office/production IP.
- Deployment staging: verify HTTPS API URL, allowed/disallowed frontend origins, frontend document headers, correct client IP behind the real proxy, and a shared limiter strategy if using multiple workers. No infrastructure was deployed in this phase.

## Remaining production risks and stopping point

Before deployment: rotate any still-valid historical credentials; establish controlled provisioning/reset and supported production schema/bootstrap procedures; set secret/environment contracts; validate TLS/private DB access, frontend CSP, proxy topology, request timeouts, monitoring/redaction and backup/restore; choose a shared/edge limiter if scaling beyond one process. Use a supported runtime and continue dependency advisories. Evaluate MFA/revocation/idle-session policies against organizational requirements in a separately scoped phase.

LocalStorage XSS exposure, ten-hour stolen-token usability, client-only logout, no password-change revocation, per-process/IP limiter limitations and UI metadata freshness are explicitly accepted limitations of this minimal change. This phase alone does not certify production readiness.

Final Git state intentionally contains only the Phase 5B source, dependency, test, example and review changes listed above, unstaged/uncommitted. HEAD remains `62371a6`. No UI redesign or deployment began.

PHASE 5B IMPLEMENTED: YES  
AUTHORIZATION CLAIM FRESHNESS HARDENED: YES  
LOGIN RATE LIMITING ADDED: YES  
PRODUCTION JWT SECRET FAIL-CLOSED: YES  
LIVE BUSINESS DATA MUTATED: NO  
DATABASE SCHEMA CHANGED: NO  
GIT HISTORY REWRITTEN: NO  
COMMITTED: NO  
PUSHED: NO
