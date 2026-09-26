# Phase 5E: Resend credential mail transport

Implemented for review on 2026-09-26. Starting HEAD: `3d96f03 add secure branch account credential lifecycle`; initial working tree clean. No commit or push performed.

## Architecture and scope

Phase 5D's `createMailService` retains shared setup/reset message generation and its disabled, injected-test and generic HTTP transports. The new `services/resend-mail.transport.js` supplies only delivery: native fetch, POST to the official Resend emails API, bearer authorization, JSON `{from,to:[recipient],subject,text}`. No dependency or lockfile change. The request shape follows the [official send-email API](https://resend.com/docs/api-reference/emails/send-email).

The adapter accepts exactly the official HTTPS endpoint. It cannot send the API key or credential message to a configured alternate host, path, query, fragment or embedded URL credentials. Redirects are rejected; the abort deadline is 10 seconds. There is one attempt, with no automatic retry. Provider acceptance is not proof of inbox delivery; real delivery was not tested.

Mandatory exact recipient membership is checked before fetch. Allowlist addresses are normalized using the existing email validator; wildcard configuration is rejected. Sender uses the existing bare-email format (display-name syntax is not added). Provider response bodies are discarded, never parsed or logged. Non-success responses, timeout/network/redirect failures and response cancellation errors become only `Mail delivery failed`, without the original exception/cause. A malformed app-origin URL is likewise reported without echoing its input.

Selecting Resend triggers configuration-only validation during backend application startup before route mounting. Missing/invalid required settings fail closed, including in production. Constructing the service never opens a mail or database connection. Disabled remains the default. Operator CLI and request-time service construction use the same validation.

Credential issuance, hashed token storage, single-use completion, expiry, forgot-password generic responses, failed-delivery token revocation, auth_version, account provisioning, Manager tenancy and Head Office authorization were not redesigned or modified. No public registration, CORS change, analytics instrumentation or raw-token logging was added.

## Operational configuration — deferred real delivery

Keep mail disabled until a separately authorized delivery exercise. The operator may later select `CREDENTIAL_MAIL_TRANSPORT=resend` and supply:

| Variable | Requirement |
| --- | --- |
| `CREDENTIAL_RESEND_API_KEY` | Required, nonempty printable non-whitespace ASCII credential supplied only through protected environment secrets. Never put it in source, tests, documentation, logs or chat. The operator will enter the real value manually in the ignored backend environment later. |
| `CREDENTIAL_RESEND_ENDPOINT` | Optional; defaults to `https://api.resend.com/emails`. If provided, must match that value exactly. |
| `CREDENTIAL_MAIL_FROM` | Required configurable bare sender email authorized by Resend. No production sender is hard-coded. |
| `CREDENTIAL_MAIL_ALLOWED_RECIPIENTS` | Required explicit comma-separated addresses; no wildcard mode. Membership is enforced before the HTTP request. |
| `CREDENTIAL_APP_ORIGIN` | Required exact HTTPS application origin, without credentials/path/query/fragment, for existing setup/reset fragment links. Existing test-only localhost allowance is retained. |

Generic HTTP transport retains its separate `CREDENTIAL_MAIL_API_KEY` and `CREDENTIAL_MAIL_ENDPOINT`; those do not substitute for Resend configuration. `.env.example` adds only an empty Resend key and the public official endpoint; the transport remains disabled. No real `.env` was edited or provider credential requested.

No verified custom sending domain is currently assumed. A Resend-compatible verified sender must be configured before real delivery. Custom sender domains require domain verification and control of the relevant DNS; see [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction). No ownership of `akolaurban.bank.in` is assumed, and sending as that domain is not claimed to work. Bank DNS must not be modified without explicit authorization. No fallback production sender is configured.

Wani, its allowlist entry, branch/email mapping, account state, setup token, and all existing Head Office accounts remain untouched. The Wani pilot and every real delivery remain separately authorized work. Recommended next step: review and explicitly authorize committing this adapter; afterward plan a separately approved sender/recipient-controlled delivery exercise. Do not enable mail merely to validate this implementation.

## Files changed

- `Bank-backend/services/resend-mail.transport.js`: isolated new provider adapter.
- `Bank-backend/services/credential-mail.service.js`: transport selection and sanitized origin parsing.
- `Bank-backend/app.js`: configuration-only Resend startup validation.
- `Bank-backend/.env.example`: blank key and official endpoint examples; disabled default retained.
- `Bank-backend/scripts/phase5e-resend.test.js`: new mocked tests.
- `Bank-backend/DATABASE_UTILITIES.md`: operational documentation link.
- `PHASE5E_REVIEW.md`: this implementation/operations review.

## Verification

All Resend requests in tests use an in-process fetch stub. Synthetic authorization values and setup/reset tokens are generated in memory; no real API key is used or persisted. Tests never contact `api.resend.com`. Existing backend fixtures use synthetic/in-memory identities and mail delivery, not live business data.

The 37 new cases cover setup/reset request fields, authorization, sender/recipient/message content, normalized explicit allowlist and zero requests for a denied recipient, missing/malformed configuration and wildcard rejection, 400/401/403/429/500/503 responses, network/timeout/redirect/cancellation failure sanitization, bounded abort signal, disabled and injected-test compatibility, and production startup validation before route/database import. The existing Phase 5D/5B suites continue to cover token consumption/revocation, generic recovery responses, lifecycle transactions, JWT invalidation and authorization.

| Check | Final result |
| --- | --- |
| Complete backend: `node --test --test-isolation=none` over every `scripts/**/*.test.js` file | **374 passed; 0 failed/skipped** (337 existing + 37 new) |
| Backend `node --check` | **42 JS files passed** |
| Frontend: `node --test --test-isolation=none scripts/operations.test.mjs scripts/credentials.test.mjs` | **11 passed; 0 failed/skipped** |
| `npm run lint` | **Passed** |
| `npm run build` | **Passed; 122 modules** |
| `git diff --check` and untracked-file whitespace check | **Passed** |
| Secret/artifact review | **Passed; no sensitive credential literals or excluded artifacts in changes; nothing staged** |

The first backend run had one test-only false positive: a whitespace-only invalid credential was compared against spaces in a fixed error message. The assertion was corrected to check the exact safe error and compare only nonblank candidate values. The complete suite then passed. No production behavior was relaxed.

No live database mutation, migration, application runtime, mail delivery, DNS change, account provisioning, deployment, commit or push was performed. Documentation was consulted on Resend's public website; no real HTTP request reached the Resend sending API. Backups, temporary runtime helpers, screenshots, node_modules, real environment files and frontend build output remain excluded from changes.

READY FOR PHASE 5E REVIEW: YES
SAFE TO COMMIT: YES
REAL EMAIL SENT: NO
WANI TOUCHED: NO
