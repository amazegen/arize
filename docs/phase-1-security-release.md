# Phase 1 — Student security fix and safe dependency updates

November 19, 2026. Based on audited Student commit `c0119af`, not adult `main` or billing PR #2. This PR contains only the MFA RPC correction, regression coverage, affected dependency updates and these release notes. No UI, billing, AI behavior or new environment variables.

## Release state

Prepared for review only. **Not deployed; migration not applied to any hosted database.** The live Student pilot still needs a separately authorized release and Student-only migration application before it receives this correction. No Stripe calls, invitations, emails, enrollment changes or live student data were used.

The remote Student branch was six commits behind the audited local baseline. The PR targets `codex/student-counselor-school-scope` at `c0119af`, preserving that existing released baseline without adding the entire Student Edition to adult main. Review the Phase 1 diff against that base, not against adult `main`.

Before publishing the PR, read-only Vercel checks found `arize-student` has no Git link and `gitProviderOptions.createDeployments=disabled`. The other Arize Team project points to `amazegen/arize2.0`, not this repository. No connection, build-machine or deployment settings were changed. Do not assume a later merge here updates either production app.

## Security change

Migration `20261119183625_student_operations_mfa_guard.sql` replaces only the existing `public.student_operations_state()` function. It reuses `student_admin_private.staff_assurance()` **before any protected staff state is read**. Enrolled staff must use an AAL2 session even when calling the RPC directly, bypassing the application server.

The function retains the existing response shape, active membership/class/school filters, empty search path, authenticated-only execution and onboarding state. No table, role, RLS policy, stored record or public permission is added. Historical migrations are unchanged. MFA remains the existing opt-in policy: users without a verified factor are not newly required to enroll. This does not make privileged MFA mandatory across the app or resolve all historic hosted Security Advisor warnings.

This follows Supabase's [MFA enforcement guidance](https://supabase.com/docs/guides/auth/auth-mfa) and [database security guidance](https://supabase.com/docs/guides/database/postgres/row-level-security): an application-layer check alone does not secure a privileged direct database function.

## Dependency changes

- `next` and `eslint-config-next`: **16.4.3 → 16.4.6**, exact pins retained; matching Next runtime/compiler/lint packages updated together.
- TypeScript ESLint family: **8.65.0 → 8.73.0**, within the existing configuration's allowed version range. Its dependency changes move the affected minimatch **10.2.5 → 11.0.9** through the upstream supported dependency, not a forced major override. Compatible nested `ignore`, `brace-expansion` and glob-matching dependency changes are recorded in the lockfile.
- No unrelated application SDK upgrades, React changes, new direct dependencies or blanket `npm audit fix --force`.
- Installation used `npm ci --ignore-scripts --no-audit --no-fund`; lockfile resolution used targeted updates with lifecycle scripts disabled.
- Before: **8 moderate affected-package findings**, including Next cache disclosure advisories and the minimatch/TypeScript ESLint chain. After: **0 known npm advisories** for this lockfile on November 19. None of the eight findings remains deferred. This is a point-in-time dependency report, not certification that the whole app is vulnerability-free.

## Local verification

Only synthetic fixtures were used in a new local PostgreSQL cluster. It listened on a private Unix socket with TCP disabled; no Supabase credentials or hosted connection were used. All schema/fixtures ran in a rollback transaction. The cluster was stopped after testing.

- **Red:** on the original RPC, the new regression failed with `MFA regression: AAL1 operations RPC disclosed protected state`. It first verified that direct table RLS denied the same enrolled-MFA teacher. This reproduces the specific RPC bypass, rather than merely checking SQL text.
- **Green:** with the new migration, the complete `tests/student-rls.sql` suite passed, including the new `tests/student-operations-mfa.sql` assertions.
- Assertions cover verified-factor AAL1 and missing-assurance denial, AAL2 teacher/operator access, unverified-factor compatibility, pending/new onboarding, revocation, anonymous/missing-identity denial, unchanged execution grants and own-class/school scoping. Existing counselor five-school, private-record, role, enrollment, reporting and AI-request SQL coverage remains included.
- `npm test`: **89/89 passed**, including Student purchase-route denial and diagnostic-content privacy tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed, **0 errors / 7 existing legacy-screen warnings**. No unrelated lint cleanup in this PR.
- Student Webpack production build: passed, Next 16.4.6, 23 static pages. Hosted acceptance flags stayed disabled; the direct Next builder does not invoke the package script's live-provider checks.
- Adult-mode shared-source Webpack production build: passed, Next 16.4.6, 23 static pages. This is compatibility checking of the Student branch's shared code, not a build of adult billing PR #2.
- No new secrets or `.env.example` changes. No chat-content logging or Student purchase components added. Builds/tests used local Node 25.8.1 / npm 11.11.0; hosted Node remains 24.x and was not changed.

### Repeat locally

From this branch with locked dependencies installed:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run typecheck
npm run lint
ARIZE_EDITION=student node node_modules/next/dist/bin/next build --webpack
ARIZE_EDITION=adult node node_modules/next/dist/bin/next build --webpack
npm audit
```

Do not opt into the `ARIZE_STUDENT_*_CHECK=synthetic-only` provider scripts for this change. These direct build commands do not run them.

For the database suite, use **only a fresh disposable local cluster**. `tests/student-rls.sql` creates mock Supabase roles/Auth functions and replays Student migrations inside its transaction; it is not a script for an existing or hosted database:

```sh
ARIZE_TEST_DIR=$(mktemp -d /private/tmp/arize-phase1-check.XXXXXX)
initdb -D "$ARIZE_TEST_DIR/data" -U arize_phase1_test \
  --auth-local=trust --auth-host=reject --no-locale --encoding=UTF8
pg_ctl -D "$ARIZE_TEST_DIR/data" -l "$ARIZE_TEST_DIR/server.log" \
  -o "-h '' -k $ARIZE_TEST_DIR -p 55439" start
trap 'pg_ctl -D "$ARIZE_TEST_DIR/data" stop -m fast' EXIT
psql -X -h "$ARIZE_TEST_DIR" -p 55439 -U arize_phase1_test \
  -d postgres -v ON_ERROR_STOP=1 -f tests/student-rls.sql
```

Expect both the Operations RPC assertions and final Student RLS rollback success messages. The trap stops this cluster even if an assertion fails. The generated directory contains synthetic data only and may be removed later using its exact path after confirming the server is stopped. No broad cleanup command is needed.

## Later release and rollback — not executed

1. Obtain separate approval for a Student release and hosted migration. Confirm the isolated Student project and existing applied function/migration history; do not replay historical migrations or use adult/mainline credentials. Some historic Student SQL applications were manual, so CLI history alone is not authoritative.
2. Capture the existing function definition, owner and ACL in the approved release record. Verify the existing `staff_assurance()` helper is present; this migration relies on its established opt-in policy. Apply only this forward function correction in a reviewed transaction. There is no data migration and no new table requiring a new RLS policy.
3. Check hosted advisors and the exact function grants/definition after application. Local SQL verification does not certify the hosted advisor inventory, and no hosted advisor or database API was contacted during Phase 1.
4. With authorized synthetic staff accounts, verify direct RPC returns permission error `42501` at AAL1 after factor verification, and the same user succeeds with an AAL2 session. Verify pending applicants can still see onboarding, and teachers cannot see another class/school or private student chats. Use fictional data, not real participant records.
5. Release the dependency update only when explicitly asked, using one Student production deployment for the approved batch. Run existing Student navigation/purchase-denial smoke checks afterward. Do not merge or deploy adult billing PR #2 as part of this fix.

**Rollback:** the function change preserves the signature and payload, so an application rollback does not require undoing the database security guard. Prefer keeping the guard and fixing forward. Package changes can be reverted as a separate reviewed dependency commit, but reverting Next/ESLint reintroduces known advisories. Restoring the original unguarded RPC would reintroduce the MFA bypass and is not a safe routine rollback. If the new function causes an incident, an authorized operator can temporarily revoke `authenticated` EXECUTE on this single RPC (staff onboarding/dashboard becomes unavailable, data remains protected), then reapply a corrected guarded definition and its intended ACL. No tables or user data need deletion. This document does not authorize any of those live actions.
