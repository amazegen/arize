# Adult release preparation — 2026-11-28

Authorized scope: update adult main, apply adult-only database updates and perform
one production web deployment. Stripe remains sandbox, checkout/enforcement stay
off, existing subscriptions are not changed, and Student is not released.

## Database receipt

- Verified AmazeGen / Arize Well, project `alzvzrfwvxxmqdgkkkae`, including absence
  of Student tables. The dashboard reported a scheduled backup six hours old.
- Applied the existing idempotent legacy schema upgrade (saved-chat prerequisites)
  and nine pending adult migrations in one guarded transaction. Migration source
  statements were recorded in `supabase_migrations.schema_migrations`.
- The first attempt hit the explicit privilege assertion and rolled back. A
  separate read confirmed membership, configuration and saved-message tables were
  absent afterward. Hosted default anonymous table grants needed explicit removal.
- Added a narrowly scoped history-grant migration and updated both baseline schema
  paths. A rollback-only test recreated broad hosted defaults in the disposable
  loopback database, applied the fix and asserted browser privileges/sequence use.
- Independent post-commit query: adult edition; nine new migration receipts;
  zero app tables without RLS; anonymous saved-chat SELECT denied; authenticated
  saved-message UPDATE denied; Village bucket private; billing disabled/test;
  browser push dispatch disabled; no Student schema.
- No real users were created/deleted, no administrator or moderator assigned,
  no chat read, no subscription canceled, no payment made and no notification sent.

## Build and configuration

- Adult lint/typecheck pass; 121 Node tests pass after the history grant fix.
- Optimized local Webpack build passed with fictional loopback configuration.
  Its initial sandboxed run could not download Google Fonts; the network-enabled
  rerun passed. No production secret was downloaded for that build.
- Adult Vercel project `prj_NWZhTSTdlFFu2d1PaRXUmXGfUg0e`, Arize Team.
  Browser UI saved Standard hardware; a separate API read confirmed fixed/standard.
  Preview builds disabled, deterministic `npm ci`, Webpack build command.
- Production config explicitly keeps adult edition, Stripe test mode, paid
  checkout/enforcement off, lead capture/email off, browser push/sending off,
  native gateway off and local diagnostics off. Existing provider keys retained.
- `.vercelignore` excludes secrets, fixtures, native assets and internal docs from
  the adult web upload. The user's untracked Nov 19 audit is not part of the commit.

## Git connection limitation and single deployment path

The previous production source was `amazegen/arize2.0`. The approved reconnect
attempt removed that old link, but Vercel's GitHub connection only exposes the
`ceomlc` namespace, not AmazeGen. The project is currently unlinked, so pushing
adult main cannot trigger its Git build. Use exactly one manual production web
deployment from the verified main commit; never also trigger a Git deployment.
Reconnecting future automatic deployment requires AmazeGen GitHub installation
access and a separately verified successful connection. Do not claim it succeeded.
Read-only inspection confirmed the Student Vercel project is also unlinked; do
not change it or its source checkout/backend/settings.

This receipt does not certify live billing, successful visible browser notification
delivery, native iPhone acceptance or App Store readiness. Founder/Clarity roles
remain explicit and unassigned by the migrations. Lead notification destination
remains configurable. Keep the overall billing launch incomplete in Mission Control.

## First production build failed — no live application promotion

Deployment `dpl_WhQoxK69KQ5DUaREPouWZoWf8WVC` from commit `9872b67` failed
because the initial unanchored `supabase` upload rule also excluded
`lib/supabase`. The existing production application remained in place.
The exclusions were corrected to root-scoped paths and a regression test added.
Do not start another billed build without the owner's approval. The adult database
updates above are already installed; do not replay them to retry an app build.

Corrected-package validation: lint, typecheck and 122 Node tests pass. A fresh
upload-shaped local copy (152 tracked allowed files, with no local secrets) was
built successfully with fictional loopback configuration. Its manifest explicitly
included all three `lib/supabase` runtime clients and excluded the root SQL folder,
native sources and `.env.local`. This does not claim a successful hosted retry.

## Mission Control

Submitted the task-level local account-deletion BUILD suggestion for owner review,
proposal `4ab40ddf-4cd1-4845-be5a-d8ebc6065ea7`, in Inbox → Give everything a date.
The reason explicitly distinguishes local build completion from production/Stripe
acceptance and the unfinished attached push/App Store child requirements. No task
or production checklist step was directly marked complete.
