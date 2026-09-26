# Database utility boundaries

Normal startup uses `server.js` and `app.js`; only authentication and business reporting routes are mounted. It must not execute setup, migration, or seed scripts.

| Utility | Decision | Purpose and limitation |
| --- | --- | --- |
| `scripts/phase1-migration.js` and its tests | KEEP | Inspects the existing schema, prepares reviewed hardening DDL, and retains its explicit apply safeguard. The completed migration and recovery are documented in the root review files. |
| `schema.json` | KEEP, historical only | Old SHOW/DESCRIBE column metadata, not user rows or a current complete schema. Do not use it as the authoritative live schema. |
| `setup_branches.js` | RESTRICT | Original branch catalogue and bootstrap schema. Drops/recreates branches and disables FK checks; unsafe for an existing database. |
| `setup_db_business.js` | RESTRICT | Original business table definitions. Does not reproduce all later hardening by itself. |
| `migrations.js` | RESTRICT | Historical users/tasks/report extension and data-sync steps. Retained to explain schema evolution, not for routine execution. |
| `scripts/seed-all-users.js`, `seed_test_users.js` | REMOVED | Demo credential provisioning; the former deletes/recreates users. Not part of supported runtime or schema hardening. |
| `check_db.js`, `test_db.js`, `test_delete.js` | REMOVED | Ad hoc live data dumps and a workflow-bypassing deletion probe. |
| Unmounted test/dbTest routes and controllers | REMOVED | Obsolete debug endpoints. |

The three historical utilities fail before importing database/environment modules unless run directly with `--allow-historical-schema-write`. This gate is an accidental-execution barrier, not a production migration workflow. Their code remains dangerous: review it and use only a separately approved, disposable database if historical reconstruction is necessary. No utility was executed during Phase 5A.

This repository does not yet provide a complete safe fresh-database bootstrap. Phase 5D adds `scripts/phase5d-migration.js` (read-only by default) and `scripts/branch-account.js` (dry-run by default) for credential schema and controlled operational-account invitations. See `../PHASE5D_REVIEW.md` for review/apply prerequisites and the deferred Wani procedure. Do not substitute old seed scripts or invent default credentials. No utility runs during normal startup.

Phase 5D authentication requires its reviewed schema migration before running the updated backend against an existing database. The migration is not automatically applied. Keep the committed Phase 5C runtime until that coordinated rollout; do not add a fail-open legacy-auth fallback. Invitation delivery requires explicit mailbox verification, apply/send flags, configured mail transport and an explicit recipient allowlist. Branch collisions require a separately reviewed incumbent-account disable, never silent replacement.

Phase 5E adds the optional Resend transport without changing provisioning or token lifecycle. See [Phase 5E configuration and review](../PHASE5E_REVIEW.md) for environment-only credentials, verified-sender prerequisites and mandatory recipient allowlisting. Mail remains disabled by default; real delivery, bank DNS changes and the Wani pilot require separate authorization.

Legacy `tasks` and `task_updates` tables, and any other historical tables recorded in schema metadata, remain untouched. Existing users (including EMPLOYEE/ADMIN), role definitions, branch records, report/item data, audit history, and permissions columns remain intact. Authentication still understands existing rows; the employee task workspace and its APIs have been removed.

Run isolated tests with `node --test --test-isolation=none scripts/*.test.js` from this directory. They use synthetic credentials and in-memory fixtures; they must never run seeds or mutate live business data. Keep local `.env` and database backups out of Git.
