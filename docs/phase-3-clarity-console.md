# Phase 3 — Clarity configuration console

November 22, 2026. **Prepared for review, not released. No hosted database, provider credentials, Stripe configuration, subscriptions, merge or deployment was changed.**

## What changed

- Separate adult and Student consoles with personality, tone, writing/voice guidance, greeting style, instructions and additional response boundaries. This is prompt configuration, not fine-tuning, audio generation or impersonation of Shelby.
- Save an immutable draft with a change note; try fictional chat examples; publish that version. History includes the administrator, timestamp, note and fields changed relative to the active publication. Versions are paginated; the latest 100 audit events are shown. Restoring an old version creates and publishes a new version instead of overwriting history.
- Concurrent publication uses a locked head row and expected-version comparison. A stale publication/restore returns 409. Re-publishing the same head is a no-op. Unsaved fields and failed preview input are retained; forms have bounded waits, loading states, labels and keyboard-accessible controls. Preview scrolling stays inside the conversation rather than moving the whole page.
- Student production chat and the existing Test Lab use the published Student settings. The new console has its own draft-preview chat; the existing Test Lab remains available for testing published settings, including its existing dictation controls.
- Adult Clarity now checks input and complete output through moderation, uses fixed safety replies, fails closed on moderation failure, sets provider `store: false` and logs only allowlisted failure metadata. Its ordinary browser history flow waits for the server's input approval before saving user text or a conversation title. Blocked input is displayed for the current interaction but not saved by that flow.
- The response remains compatible with the adult text-response reader, but generated tokens are deliberately **not streamed before output moderation**. This adds a wait before the answer appears. It is not a claim of instant responses.

## Where to find it after a separately approved rollout

| Edition | Entry | Permissions |
|---|---|---|
| Adult | Profile → Clarity AI configuration; `/admin/clarity` | Auth identity in protected `clarity_admins`, active; enrolled MFA must be complete |
| Student | Project workspace → Clarity test lab → Open AI configuration console; `/student/operator/clarity` | Existing active Student project operator; enrolled MFA must be complete |

Each entry, API and database function checks authorization. Profile fields, email strings and user-editable Auth metadata never grant a role. School staff, teachers, counselors without project-operator status and students cannot edit or view console history.

## Isolation and locked safety

Each database gets its own singleton installation edition, detected from the existing Student schema when the migration is installed. A request for the other edition is denied. Browser users cannot change that installation or grant themselves an admin role. All six new tables have RLS and no direct browser table privileges. Transactional SECURITY DEFINER functions use an empty search path and explicit role/MFA checks; anonymous execution is revoked.

No new secret is required. **Keep Curtis's adult `OPENAI_API_KEY` in the adult deployment and the existing Student key in the Student deployment. Do not copy either into the other app, download production secrets for local development or put them in the console.** Student keeps its separate existing `STUDENT_AI_ENABLED` and `STUDENT_COACH_MODEL` gates. There is no console field for model, provider URL, key, moderation, billing, consent, quotas or counselor destination.

The existing Student `safety.ts`, crisis wording and counselor button behavior are unchanged. Both moderation stages remain outside administrator text. Administrator preferences are subordinate to the fixed rules. Chat does not notify a counselor, emergency services or a live monitor. Moderation is a safeguard, not guaranteed crisis detection or a clinical service.

Preview calls require authentication, same-origin requests, a fictional-example acknowledgment, a bounded six-field config and a bounded conversation. The database limits each admin to 5 claims/minute and 100/day and rejects reused request IDs. Only usage metadata is stored; preview prompts/replies are not stored in chat history, reporting or console logs. The configured AI provider still processes them. Audit records contain administrator attribution and change notes, not student chat. Do not put private student information in either.

When the configuration migration is not installed, or a published style cannot be loaded/validated, normal chat uses reviewed built-in style with the fixed safety pipeline. The console itself fails closed rather than pretending to save. Configuration fallback does not bypass Student enrollment, consent, AI enablement or existing usage limits.

## Source branches — important

The adult billing and Student sources are divergent. The single Phase 3 review PR is stacked on `codex/student-phase-1-security` (`00228e4`), not adult `main`. It contains the shared console, adult integration and Student adapters. **Do not merge the Student branch into adult main.**

An edition-specific local adult counterpart is on `codex/phase-3-clarity-adult`, based on the actual Phase 2 billing head `bb8829c`. Only the shared modules, adult pages/routes, migration, common tests, fixture and these notes were transferred; no Student routes, school data, Student dependencies, billing rewrites or Reflect changes were brought over. It is validated separately and intentionally has no second PR or deployment. Reconcile this reviewed adult delta into the adult review stack only in a later authorized integration step. The Phase 3 PR is not a single safe merge-to-main release vehicle for both apps.

## Validation record

Story: verified administrator → console editor → edition-bound API → transactional local PostgreSQL versions/head/audit → fictional provider preview → publication/restore reflected in UI.

| Check | Result |
|---|---|
| Adult baseline | 60 Node tests pass; typecheck passes; ESLint 0 errors / 4 pre-existing warnings; Webpack production build passes |
| Student baseline | 99 Node tests pass; typecheck passes; ESLint 0 errors / 6 pre-existing warnings; Webpack production build passes |
| Database | Adult console fixture and full Student RLS suite pass in fresh disposable local PostgreSQL, with fixture transactions rolled back; includes role escalation denial, MFA, revocation, cross-edition rejection, draft isolation, publish/restore, stale-head conflicts, audit preservation and preview burst limits. Documented schema rollback also passes on the disposable adult browser fixture, leaving the separate Student fixture publication unchanged. All local fixture servers/clusters were stopped afterward. |
| Browser/API/SQL | Adult save → preview → publish → second version → restore → reload passes with real local SQL and simulated Auth/AI; Student has its own independent database and completes save → preview → publish; fake moderation classification triggers the real fixed Spanish 988/911/counselor response |
| Responsive | Both console views measured at 375/768/1280 CSS pixels without document overflow; Student console has no purchase text; no Student console browser errors in the test run |
| Live acceptance | **Not run.** No local real provider credentials were available or downloaded. Real provider wording, actual Supabase Auth/MFA and hosted installation still require a separately authorized acceptance/rollout |

The browser fixture is not Supabase Auth verification or an OpenAI quality evaluation. The SQL assertions test the real migration independently, including MFA bypass attempts and ordinary-user denials. A local fixture-role collision during a repeat run was resolved by running the unchanged Student suite in another fresh cluster; no hosted role was altered.

## How to test locally

1. Run `npm test`, `npm run typecheck`, `npm run lint` and the Webpack build. In the Student checkout use `env ARIZE_EDITION=student node node_modules/next/dist/bin/next build --webpack`; do not opt in to any guarded live-check scripts.
2. In a fresh disposable PostgreSQL cluster run `psql -X -v ON_ERROR_STOP=1 -f tests/clarity-adult-database.sql`. Separately run `tests/student-rls.sql` in a fresh cluster; it includes the new migration and assertions. Both roll back their fixtures. Existing Student SQL tests assume the synthetic roles do not already exist.
3. For browser tests, start a new local-only cluster using the synthetic role `arize_phase3_test`, a socket directory `/private/tmp/arize-phase3.<unique>` and port 55441, with TCP disabled. The fixture refuses other socket path patterns and never overwrites an existing database.
4. `ARIZE_TEST_SOCKET=<that-socket> node tests/fixtures/clarity-console-backend.mjs --synthetic-only` creates `clarity_ui_adult` on 3148. Adding `--student` creates separate `clarity_ui_student` on 3158. These contain only synthetic config/admin records. Stop the processes and cluster afterward.
5. Run local Next with the matching loopback Supabase URL, fake anon value, `OPENAI_API_KEY=synthetic-not-a-real-key` and `OPENAI_BASE_URL=http://127.0.0.1:<fixture-port>/v1`. For Student also use `ARIZE_EDITION=student`, `STUDENT_AI_ENABLED=true`, `STUDENT_COACH_MODEL=synthetic-model`. Do not run two dev processes from the same checkout/dist directory at once. Never put these fixture values into Vercel.
6. Sign in to the local fixture as `clarity-admin@example.test` / `synthetic-console-only`; open the corresponding console. Save, preview, publish, restore and reload. `FIXTURE_SELF_HARM` is a **fixture-only classifier control**, not a production keyword rule. Try Spanish. Check that editing invalidates the prior draft preview. Verify an ordinary account and the wrong edition are rejected using the SQL tests.

## Later rollout prerequisites (not performed)

- Review and approve `20261122163011_clarity_configuration_console.sql` independently for each app's correct database. It only adds console objects; it does not activate a pilot or assign anyone a role. Do not run against a mixed adult/Student database.
- Verify each deployment uses its own existing Curtis-owned provider connection. No account creation, key rotation or provider migration is part of this change.
- After explicit authorization, provision named adult administrators by verified Auth UUID in `clarity_admins`; no email-based automatic assignment is built. Student reuses already-approved project operators. Do not treat the consultant's past access or a profile label as adult-console authorization.
- With approved test access, run ordinary en/es coaching, crisis/self-harm/sexual-content cases, moderation outage, unauthorized APIs, two-admin conflict, Student counselor routing, real MFA and actual history checks. Review writing/safety with Curtis and Shelby. A successful fictional preview does not certify arbitrary administrator instructions or all crisis cases.
- Reconfirm correct repository/project mapping before any separately authorized release. Branch builds are disabled for the named Phase 3 branches in `vercel.json`; no Preview or production build was requested here.

## Rollback / reversibility

Prefer restoring the prior reviewed version from the console. It preserves the new safety controls and audit history. If the console application needs rollback, use a separately reviewed fixed-style code revision that **retains both moderation stages**; do not silently revert the adult app to unchecked output streaming.

For a separately approved full schema rollback, export configuration/audit records securely first and stop console writes. Only the new objects below are removed; this destroys console history, so never run it merely to test a release. It has **not** been executed against any hosted database:

```sql
begin;
drop function public.clarity_console_state(text,integer);
drop function public.clarity_active_config(text);
drop function public.clarity_change_config(text,text,jsonb,text,uuid,uuid);
drop function public.clarity_claim_preview(text,uuid);
drop function public.clarity_console_allowed(text);
drop function clarity_private.valid_config(jsonb);
drop table public.clarity_config_audit;
drop table public.clarity_config_head;
drop table public.clarity_config_versions;
drop table public.clarity_preview_usage;
drop table public.clarity_admins;
drop table public.clarity_installation;
drop schema clarity_private;
commit;
```

Normal chat has a built-in configuration fallback; dropping the new schema does not remove any existing chat, school, counselor, consent, membership or billing table. Keep a retained export under the client's administrator-audit retention policy. Reflect, Stripe and the existing Student school/counselor setup are outside this phase.
