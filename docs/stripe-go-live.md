# Adult Core / Plus go-live runbook — instructions only

**Not executed.** Phase 2 is sandbox/local only. This document is not permission to merge PR #2, change a hosted database, retrieve live credentials, launch subscriptions or deploy. Existing subscriptions must remain intact. Student billing stays inaccessible and its backend/project are out of scope.

## 1. Resolve ownership and release source

- Curtis confirms the AmazeGen Stripe owner, invited operator access, exact live account ID, launch approval and operational contacts. Use individual invited access, not shared owner passwords or recovery codes.
- Confirm the adult application's actual source repository/branch and deployment SHA. November 19 read-only metadata showed Arize Team's adult Vercel project `arize` linked to **`amazegen/arize2.0`**, whereas billing PR #2 is in **`amazegen/arize`**. Stop before release until this is reconciled. Do not repoint Git, merge between repos, duplicate a deployment or assume this PR reaches the website automatically.
- Obtain completed [sandbox acceptance](billing-acceptance.md), client offer/cancellation/dunning/early-member decisions and privacy/deletion wording. Exact current offer: free Core; Plus $1.99 monthly / $19.99 annually. Do not silently use an earlier $24/year figure.
- Record a release owner, risk-review owner, support contact and incident/rollback decision maker. Refund/dispute/fraud events currently queue `needs_review`; that is not an automatic alert/escalation system or automatic refund.

## 2. Validate the adult schema and protect existing members

- With separate database authorization, confirm the **adult** project ID, backup/PITR recovery and migration history. Do not use the isolated Student project. Check actual definitions as well as history because prior changes may have been applied in the SQL editor.
- Baseline must include profiles, legal consents, check-ins/goals/Village, coach quota and **`coach_conversations` / `coach_messages`**. A November 18 inventory did not list those history tables. Reconcile missing prerequisites in an approved non-production copy first; do not blindly replay the entire upgrade script in production.
- Test `20261106220254_mainline_membership_launch.sql` against that copy. It rejects a Student backend and creates its rollout row disabled. Its new tables have RLS and service-only mutation privileges. Validate existing Storage policies and roles rather than granting broad access to suppress errors.
- Audit `billing_customers` mappings and existing access grants in the intended Stripe account/mode. The legacy mapping is one customer per user, not mode-partitioned. Never overwrite a paid customer's binding with a sandbox ID, reuse a sandbox ID in live mode, mass-revoke grants or cancel subscriptions as a cutover shortcut. Review each correction and preserve legitimate entitlements.
- With explicit authorization, apply only the reviewed needed forward changes. Verify definitions, ACL/RLS and advisor findings. Keep the database rollout disabled until the matching tested application/configuration is ready.

## 3. Prepare live Stripe separately, only after approval

1. Select the verified AmazeGen **live** account, not a sandbox, and confirm the account ID with the release record. This step is intentionally prohibited during Phase 2.
2. Review/reuse the approved active Plus Product and two recurring USD Prices: 199 cents/month and 1999 cents/year, quantity one. Core is free, not a second paid recurring plan. Verify exact amount, currency, interval and active Product. Do not edit historical prices or create duplicates without an approved reason; a changed offer requires coordinated code/tests/catalog changes.
3. Review the explicit customer portal configuration: allow cancellation and payment-method updates; confirm cancellation timing and whether users can undo a scheduled cancellation. Do not enable arbitrary product switching or change all existing subscriptions while testing the portal.
4. Complete the client's tax-adviser decision before charging. Automatic tax is not enabled by this PR. If approved, separately verify registrations/settings, product tax code, Price tax behavior, customer-location handling and displayed totals before implementation; do not infer obligations or turn on a paid tax service from this checklist. See [Stripe subscription-tax setup](https://docs.stripe.com/billing/taxes/collect-taxes).
5. Create/reuse a least-privilege **restricted live key** scoped to the approved integration. Validate required account/price/product/customer/subscription/Checkout/portal/invoice/charge permissions without defaulting to an unrestricted key. Creation or expanded access requires its own approval when applicable. Store only in the intended server secret store/sensitive environment settings; never copy it into chat, Git or screenshots.
6. Configure the exact adult `/api/billing/webhook` endpoint using the snapshot payload expected by the handler and API version **`2026-10-28.endive`**. Subscribe to the 12 events in `lib/billing/policy.ts`: checkout completion/async success; subscription created/updated/deleted/paused/resumed; invoice paid/failed; refund/dispute/early-fraud warning. Do not use a thin-event payload with a snapshot handler or blindly subscribe to every event.
7. Securely install this endpoint's signing secret. It is not interchangeable with the sandbox or local CLI listener secret. Confirm signature validation and expected live account/mode without disclosing the secret.

## 4. Environment/configuration checklist

Use `.env.example` for names, never values. Initially leave rollout/checkout flags disabled while validating the deployment and dependencies.

- Adult Supabase browser URL/key and server-only service-role key must reference the verified adult backend.
- `ARIZE_STRIPE_SECRET_KEY`: restricted key for the expected live account.
- `STRIPE_EXPECTED_MODE=live` and exact `STRIPE_EXPECTED_ACCOUNT_ID`.
- `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`, `STRIPE_PORTAL_CONFIGURATION_ID`, `STRIPE_WEBHOOK_SECRET`.
- `NEXT_PUBLIC_APP_URL`: approved adult HTTPS origin, no path/query/credentials; confirm checkout return URLs and Auth callbacks.
- `BILLING_ACCESS_SIGNING_SECRET`: independent random server-only secret, at least 32 characters. Do not reuse a Stripe/OpenAI/Supabase key. Plan rotation around the maximum six-hour continuity window; do not log cookies.
- Matching `STRIPE_CHECKOUT_ENABLED` and `NEXT_PUBLIC_BILLING_CHECKOUT_ENABLED`, plus `BILLING_ENFORCEMENT_ENABLED`. The database gate's `stripe_mode` and enabled state must agree with the environment. Do not turn on enforcement before checkout works.
- Preview/local environments must never receive live Stripe keys or copied live database credentials. Do not alter Student environment variables.

Run `npm run billing:check` in the trusted intended environment. With explicit read-only live verification approval, `npm run billing:verify` checks account/price/portal/endpoint metadata via GET requests. Neither proves a successful signed delivery, valid checkout, payment recovery or actual customer access.

## 5. Release gate and one-deploy rule

1. Require reviewed code, green typecheck/tests/lint/Webpack build, complete sandbox results, database-copy validation, client approval and resolved repository provenance. Keep PR #2 draft until its required acceptance is actually complete.
2. Obtain explicit merge/deploy/database/configuration authorization. The Phase 2 instruction says **do not merge or deploy** and remains in effect until separately changed.
3. Use exactly one deployment path for the resolved project. If production Git auto-deploys on main, an approved merge is the deploy; do not also run Vercel CLI. If Git deployment is disabled, use the separately approved manual path from the verified main commit. No preview unless specifically requested; Standard build machine only.
4. Coordinate application, reviewed migration and configuration so users cannot reach a version with missing RPCs/tables. Keep rollout disabled during dependency preparation. Recheck account bindings/mode before activation.
5. After separate approval and readiness, align the database gate and server/public flags. Schedule the early-member complimentary grants only for the approved launch timestamp and eligible users; do not restart or shorten existing trials arbitrarily.
6. Smoke-test sign-in/legal consent, Membership/portal routing, Core/Plus enforcement, webhook processing and ordinary product pages. No real charge, cancellation or permanent deletion as a smoke test without specific authority and the designated disposable account.
7. Record commit/deployment/configuration version, sanitized event evidence, results and support ownership. Monitor signature errors, webhook retries, failed renewals, risk queue and deletion failures without logging private chat contents or credentials.

## 6. Safe incident response / rollback

- Preserve verified access grants, customer mappings and processed-event receipts. Never delete billing records or cancel subscribers to roll back a code change.
- An authorized operator may pause new checkout and temporarily disable enforcement in a coordinated database/environment change, restoring the existing full-access rollout behavior while investigating. Keep portal cancellation/payment recovery available where possible. Public environment flags require the normal approved build path; do not promise an instantaneous frontend flag change without a build.
- Continuity cookies give only a bounded six-hour recent-user snapshot; eligible renewal grace is at most 72 hours. They do not restore database availability or guarantee all RLS-protected operations work during an outage.
- Retry/reconcile failed webhook deliveries after dependencies recover. The handler synchronizes current subscription state and deduplicates event IDs. Review refunds/disputes/fraud separately; do not fabricate a successful ledger completion.
- Prefer leaving additive tables and guarded RPCs installed while rolling application code forward/back compatibly. Do not drop the schema while any app version depends on it. Reversing database policies can weaken access controls and needs a reviewed plan, not a blanket down script.
- Account deletion can be partially completed and is not reversibly undone by a code rollback. Use recorded deletion stage/retry logic; do not recreate deleted accounts, restore private data or uncancel subscriptions automatically. Recover backups only under the agreed incident/privacy process.

## Stop conditions

Wrong account/mode/repository/backend, unresolved customer bindings, missing schema prerequisites, failed real sandbox acceptance, missing legal/tax/client decisions, or no explicit release approval means **stop before activation**. Document the exact blocker; do not switch to live credentials, weaken authentication or deploy an untested workaround.
