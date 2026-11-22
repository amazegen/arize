# Phase 5 — Founder overview

2026-11-22 · `codex/phase-5-founder-dashboard` · adult app only.

## Delivered for review, not released

`/admin/founder` and `GET /api/admin/founder` provide an authorized, aggregate-only overview: registrations, rolling weekly activity, check-ins, saved Clarity conversations, people by feature, current monthly/annual Plus subscriptions, Stripe trials, complimentary trials and mature trial-to-paid conversion. Range controls support 7/30/90 days; Refresh loads a new snapshot. Profile exposes the link only after the server permission RPC allows it.

Jadon's Founder frame 66:4611 is adapted to the adult app rather than copying Student labels. See `design/founder-dashboard/README.md`. Accessible chart descriptions, exact daily tables, keyboard-focus styles and phone/tablet layouts are included. Missing backend data displays an unavailable state, not replacement demo numbers.

No merge, Vercel preview/production deploy, hosted database access/migration, real role grant, environment change, Stripe API call, checkout, cancellation or subscription activation occurred. All new database work ran on a fresh local PostgreSQL 18 cluster with TCP disabled. Existing subscriptions are untouched. No dependencies or billing API versions were changed.

## Metric contract

| Measure | Population and calculation |
| --- | --- |
| Registrations | Retained adult Auth users with app profiles, created in the selected range; includes unconfirmed accounts. Founder/Clarity administrator accounts, including revoked administrators, and pending-deletion accounts are excluded throughout the overview. This is not lifetime acquisition attribution. |
| Active people | Distinct eligible users with a saved check-in, newly created goal, Village post or saved Clarity user turn. Login/page visits alone do not count. |
| Weekly active | Most recent seven New York calendar dates. Each chart bar is the rolling seven-day count at that date; overlapping bars are never summed. |
| Check-ins | Saved check-in records in range, not unique users or emotional scores. |
| Clarity conversations | Distinct saved conversation IDs with a user turn in range. Empty/assistant-only chats, administrator previews and model/quota requests are not sessions. Daily distinct counts may overlap across days. |
| Feature use | Distinct people by feature in range. People can appear in multiple bars. Goals measures creation, not completion or viewing. |
| Plus monthly/annual | Current active, unexpired subscription grants, in configured Stripe mode, with active Stripe state and known billing period; payment grace, administrator grants and complimentary trials are not paid subscriptions. Scheduled period-end cancellation still counts until the period ends. Counts are subscriptions, not deduplicated customers or revenue. |
| Stripe trials | Current checkout-trial grants with trialing Stripe state, separate from complimentary early-member trial users. |
| Classification | Active billing records with unknown mode, period or state produce a warning instead of being guessed into a bucket. Known test/live records remain partitioned. |
| Conversion cohort | Subscription trials starting after reporting capture began, ending in the selected range, with a completed **168-hour** follow-up. Denominator: those mature trials; numerator: trials with a positive paid USD subscription invoice from trial start through trial end + 168 hours. This is a subscription cohort, not unique people. |
| Conversion limits | No eligible trials means unavailable, not 0%. A known nonconverting cohort can be 0%. Missing reporting receipts or pending/failed webhooks withhold the rate. Historical cohorts are not reconstructed; checkout redirects, active status alone and $0 trial invoices do not prove payment. Refunds/disputes do not reverse this conversion measure; it is not net revenue. |

Ranges include today, which is partial. Boundaries use `America/New_York`, including DST. Stocks are current saved grant state and do not change merely because the activity range changes. Snapshot timestamps, capture-start and last processed webhook are shown. Counts reflect saved data, not live Stripe reconciliation. Account deletion removes the user's reporting facts via foreign-key cascade, so retained-history totals can decrease; no identifier-based historical ledger survives deletion.

## Security and isolation

- Founder is a separate `founder_admins` permission, not a Clarity editor, Profile preference, email allowlist or `user_metadata` flag. No real person is granted this role by the migration. A future authorized release must resolve the intended account UUID and separately approve provisioning. Enrolled verified MFA factors require `aal2`; revocation is checked on every request.
- All four new tables have RLS enabled and no direct anonymous/authenticated browser grants. Browser-exposed functions are security-invoker wrappers; the narrowly scoped, fixed-search-path aggregate definers are in the non-exposed `founder_private` schema. Reports select identifiers/timestamps for aggregation, never chat content, journal text, emotional scores, names or emails. The TypeScript DTO independently whitelists and reconciles the aggregate response.
- Reporting API responses are private/no-store; unsupported ranges, repeated query filters and mode overrides are rejected. Server permission/data RPCs have bounded client abort timeouts. The database function is range bounded and has a statement timeout setting; this is not a large-scale load-test guarantee.
- Reporting capture is service-only, after the existing signed, account/mode-checked webhook workflow succeeds. Owner identity is obtained from the verified grant/customer mapping. Idempotent receipts and subscription facts contain only the minimal payment/trial metadata. The capture attempt is bounded to 1.5 seconds and cannot turn a successful billing acknowledgement into a failure. A duplicate delivery can repair a missing capture. Access-grant logic and checkout/portal/cancellation flows are unchanged.
- Added billing metadata is only trial start/end timestamps. There is no raw invoice/customer/event-payload logging. Reporting failures log only a fixed diagnostic label.
- The Student source checkout is unchanged. Student guard checks exist at route and SQL levels. The Student panel says **Not connected**: there is no Student credential, request, school list or private record in this dashboard. Any future cross-app aggregate connection needs a separately reviewed endpoint/authorization contract; it is not silently enabled here.

The permissions follow [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security), and observations follow the existing verified [Stripe subscription webhook flow](https://docs.stripe.com/billing/subscriptions/webhooks). This is not a compliance certification or proof of real-provider acceptance.

## Verification

| Check | Result |
| --- | --- |
| Adult typecheck / lint | PASS; zero lint errors, one unchanged marketing `<img>` warning at `app/page.tsx:50`. |
| Adult Node tests | PASS — 75/75, including 8 new Founder tests and all prior safety/billing tests. |
| Adult optimized local Webpack build | PASS — no Vercel build. Fictional loopback Supabase settings; billing enforcement and checkout explicitly disabled; Stripe mode test. |
| Real local PostgreSQL migration | PASS on a new database using baseline + prior-phase migrations + the new migration. No hosted credentials or database were used. |
| Local SQL assertions | PASS — ordinary/Clarity-only/anonymous denial; no self-grant/raw table access/browser capture; MFA; immediate revocation; Student guard; zero-filled dates; 7/30/90 ranges; New York repeated DST hour; deduplicated conversations; trial/payment/grace/mode classification; idempotent observations; missing/pending capture; deletion cascade; RLS and public-function catalog checks. Fixtures roll back. |
| Local HTTP → real SQL | PASS — anonymous 401, ordinary 403, Founder 200 at all three ranges, invalid/duplicate/mode filters 400, private/no-store, aggregate-only response and sandbox scope. |
| Local browser | PASS at 375×812, 768×1024 and 1280×900: no horizontal page overflow/broken images; real SQL-derived fictional data; range selection/Refresh; exact daily table; real empty counts and unavailable-RPC state. Both failure fixtures were restored. |
| Local query plan | A 90-day call on the small fictional fixture took ~23ms; not a 1,000-user/concurrency benchmark. Time/source indexes are included; validate at representative scale before release. |
| Student regression | PASS — 99/99 tests, typecheck and optimized Student build, clean separate checkout at `a2a77f1`. No source changes. |
| Provider limitations | Synthetic Auth is not real Supabase Auth/MFA/PostgREST/Stripe/email acceptance. Real-provider billing tests from Phase 2 remain outstanding, not marked done by these tests. Supabase CLI 2.75 has no hosted advisor command used here; local catalog/permission checks are not represented as hosted advisor results. |

Screenshots are fictional local review evidence at workspace `outputs/arize-phase5-2026-11-22/`, not seeded production content or committed application assets.

## Local reproducibility

Use a fresh disposable PostgreSQL database only; no real environment file or credentials. `tests/founder-bootstrap.sql` simulates Supabase Auth/Storage roles, installs actual schema dependencies, and applies the new migration. Run `tests/founder-database.sql` afterward; it rolls its fixtures back. `tests/founder-rollback.sql` rehearses removing only Phase 5 objects and then rolls that rehearsal back.

For the UI fixture, create a **new** local database named `founder_ui` on a TCP-disabled cluster, using the fictional local role `arize_phase5_test`, Unix socket `/private/tmp/arize-phase5.<random>` and port 55451. Run bootstrap, then `tests/fixtures/founder-seed.sql` once. The seed is fictional and is not a migration. Point `ARIZE_TEST_SOCKET` to that exact socket directory, then:

```sh
node tests/fixtures/founder-backend.mjs --synthetic-only
```

Use the same following fictional variables for the local build and start:

```sh
env ARIZE_EDITION=adult NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3168 NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-founder-anon STRIPE_EXPECTED_MODE=test BILLING_ENFORCEMENT_ENABLED=false STRIPE_CHECKOUT_ENABLED=false NEXT_PUBLIC_BILLING_CHECKOUT_ENABLED=false npm run build -- --webpack

env ARIZE_EDITION=adult NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3168 NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-founder-anon STRIPE_EXPECTED_MODE=test BILLING_ENFORCEMENT_ENABLED=false STRIPE_CHECKOUT_ENABLED=false NEXT_PUBLIC_BILLING_CHECKOUT_ENABLED=false npm start -- --hostname 127.0.0.1 --port 3169

node tests/fixtures/founder-smoke.mjs --synthetic-only
```

Sign into `/sign-in` with `founder@example.test` / `founder-fixture-only`, then open `/admin/founder` (existing sign-in returns Home). `ordinary@example.test` with the same fictional password is intentionally denied. These accounts do not exist on the real app. The fixture performs no external provider requests and refuses non-loopback/local-database destinations. Its fake password/session signing values are not real credentials.

## Review dependencies and future activation

This PR is stacked on adult Phase 4 PR #5, base `codex/phase-4-adult-redesign` at `9ed6a02`. It also depends on the earlier adult billing and adult Phase 3 counterpart. Do not merge Student PR #4 into this adult lineage. The untracked Nov 19 audit belongs to the user and is excluded from this change.

`vercel.json` disables Git deployment for this branch and earlier review branches. No `main` push or build-machine setting change occurred. Prior read-only inspection found Arize Team's adult project linked to `amazegen/arize2.0`, not this repo; this phase does not repoint it. Resolve the intended future deploy path before an explicitly authorized single-batch release.

Before future activation: separately approve the adult migration, validate its schema against the intended sandbox, provision explicit Founder UUIDs with MFA, verify real sandbox webhooks and report freshness, confirm representative query performance, and review missing historical coverage. No new API keys are required for Phase 5; reuse the adult app's existing server integration only. Never copy Student keys into adult settings. Keep Stripe in test mode until a separately approved live launch.

Rollback before release is discarding/reverting this review change. After a future approved installation, stop/roll back the new webhook observer before removing its RPCs. Back up any reporting history and authorized role assignments before dropping Phase 5 objects; the local rollback rehearsal enumerates those exact objects and preserves prior-phase billing/Clarity objects. This document is not authorization to run that removal on a hosted database.
