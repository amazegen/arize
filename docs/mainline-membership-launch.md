# Mainline Core / Plus launch handoff

Mission Control: `task_9d7c17b8-3764-4d14-8914-e75e25bb892a`.

## Scope and release status

This PR is based on mainline `beff76d`. No Student Edition files, backend, domain or Vercel project are changed. Do not merge, apply the migration, turn on billing, or deploy without a separate release instruction. `vercel.json` disables automatic Git deployments for this PR's branch only; it does not disable main's existing release behavior or change build-machine settings.

Local unit tests use fake Stripe responses. Local PostgreSQL tests simulate Supabase roles. Neither is evidence that real Stripe sandbox checkout, real hosted Auth deletion, SMTP, webhooks, or live billing have passed. The production checklist must remain open until those checks actually happen.

## Offer preserved from existing code; client confirmation still required

- Core: free; 3 active goals; current-week goal history; 7-day Reflect/Pattern history; 3 recent Clarity conversations; 5 Clarity requests per rolling day / 20 per calendar month; Wins Only text chat.
- Plus: $1.99 USD/month or $19.99 USD/year; full history and active goals, all Village rooms and media, 30 Clarity requests/day / 300/month. Reports/exports are still described as available as released, not newly built here.
- Card-required 7-day trial for new billing customers only. Canceled subscription history does not reset eligibility. A longer remaining 14-day complimentary early-member trial is preserved when an eligible customer checks out; it is not shortened to seven days.
- Existing early-member launch script remains opt-in and refuses to run without an agreed launch timestamp. Do not invent a launch date or restart old trials automatically.
- Prices are checked server-side for amount, USD currency, mode, active product and exact monthly/yearly recurrence before opening checkout. A different approved price requires updating the offer, tests and Stripe configuration together.

## Code safeguards

- Same-origin authenticated billing mutations, verified email/current legal consent for checkout, bounded JSON, no-store responses, Stripe-hosted redirect allowlist, stable retry keys, per-account operation leases and open-session reuse.
- Customer identity is mapped through server-owned `billing_customers`; event metadata alone cannot attach a subscription to another account. The webhook reads current Stripe subscription state inside the account lease rather than applying an old event snapshot.
- Token-fenced webhook processing distinguishes completed duplicates from busy deliveries. Busy/failed deliveries return a retryable failure, not a false acknowledgment. Lifecycle, paid/failed invoices, paused/resumed subscriptions and refund/dispute/fraud events are handled.
- Risk events are stored in service-only `billing_risk_events` as `needs_review`; they do **not** automatically revoke access or issue a refund. An operator must review them and decide the account action. Configure an actual operational review/alert process before launch; a console warning alone is not an on-call system.
- Payment-failed **renewals** receive a bounded 72-hour recovery window. A stale last-known-active renewal also gets up to 72 hours beyond its recorded paid period, but a known scheduled cancellation does not. Known canceled/unpaid/incomplete states do not receive speculative paid access.
- Recently verified members get a user-bound, signed, HttpOnly six-hour continuity cookie for temporary membership-read failures. Outage cookies cannot be renewed during the outage. This cannot restore unavailable database content or guarantee unlimited outage access, and known successful Core checks clear the cookie.
- Core limits are enforced in database policies/triggers and quota RPCs, not only in the UI. Clients cannot choose their own larger AI budget, grant themselves Plus, use the privileged billing RPCs or read another user's records.
- Goals do not show a successful completion when the database rejected it. Settings have associated form labels, a wider responsive container, accessible deletion controls and visible focus states; membership cards fit narrow screens. Browser zoom is no longer disabled.

## Account deletion

Profile & Settings includes an explicit permanent-deletion form. It requires a sign-in within 15 minutes, a typed confirmation and a separate acknowledgment. It first records a resumable deletion job and pauses account data access, then cancels subscriptions without creating a final invoice/proration, deletes the reusable Stripe customer, removes owned Storage objects using the Storage API, and deletes Auth identity. Foreign-key cascades remove owned application records. A failure does not falsely report completion; a pending account sees a retry/sign-out screen before the legal-consent gate.

Financial records retained by Stripe, provider safety logs, backups until their normal expiry, and other people's downloaded copies are not promised erased. Existing public Village media URLs/buckets are not converted to private storage in this PR. Do not test permanent deletion against a real client's account. A non-personal job receipt and service-only webhook/risk IDs remain for operations; set an approved retention policy before launch.

## Configuration / migration review (NOT executed by this PR)

1. Independently verify Curtis's invited AmazeGen Stripe account and account ID. Use a restricted key, not shared login credentials; never paste a key into GitHub, chat, screenshots, commands or documentation. Read-only dashboard verification does not authorize live changes or test charges.
2. Review `20261106220254_mainline_membership_launch.sql` against the **adult** project, including existing Storage policies. The guard rejects a backend with `student_pilot_memberships`. Back up and apply the migration in a disposable sandbox first. Existing baseline schema and three prior migrations are prerequisites. The new `membership_launch` row defaults to **disabled**.
3. Audit legacy `billing_customers` bindings. The old table is one customer per user and is not mode-partitioned. Do not reuse a test customer ID in live mode or silently replace a live binding: verify each binding in the intended Stripe account/mode and plan a reviewed test-to-live mapping cutover. Unknown owners are deliberately ignored by webhook synchronization; backfill only verified existing subscriptions. Keep real paid grants intact. This is a release blocker if legacy test bindings remain in the production dataset.
4. Securely configure `.env.example` names in the intended environment: matching checkout flags; expected mode/account; monthly/annual price IDs; explicit portal configuration; webhook signing secret; server-only Supabase service key; and a separate random `BILLING_ACCESS_SIGNING_SECRET` of at least 32 characters. Do not pull production credentials into this checkout. Preview must not use live Stripe.
5. Restricted key permissions must cover account identity, price/product reads, customer creation/read/deletion, subscription list/read/cancellation, Checkout session list/create/expiry, explicit portal configuration read/session creation, invoice/payment/charge reads needed for risk resolution, and webhook endpoint read if using the preflight script. Keep all keys server-side. Verify actual required scopes in the sandbox rather than using an unrestricted key to bypass missing permissions.
6. Configure the explicit portal to allow cancellation and payment-method updates. Decide and confirm the cancellation timing and dunning/retry policy; verify the actual setting in a test subscription. Do not enable arbitrary subscription product switching without verifying approved prices.
7. Connect the exact `/api/billing/webhook` URL, pinned Stripe API version `2026-10-28.endive`, matching signing secret and all `BILLING_EVENTS` in `lib/billing/policy.ts`. This PR upgrades stripe-node to 23.1.0; do not assume an older endpoint version is compatible without tests.
8. Run `npm run billing:check` and the read-only `npm run billing:verify` in a trusted environment with the correct securely supplied variables. The latter performs only GET requests and prints no secret values. It does not verify the secret by receiving a signed delivery.
9. Review tax obligations and whether Stripe Tax is appropriate with the client/adviser. Automatic tax is **not enabled** here; do not switch it on without approved setup/registrations. Confirm any fees/taxes shown to users before accepting payment.
10. Only after the following acceptance tests and a separate release approval: set the database rollout `stripe_mode` to the verified mode and enable it together with the matching server/public environment flags. A flag-only rollout without the reviewed database migration is not complete.

## Required sandbox acceptance record — pending until real tests run

Use disposable consenting tester accounts and Stripe test cards, not real card details. Record timestamp, test account alias, mode, sanitized subscription/session/event IDs and actual result. Do not store full events, personal chats, keys, webhook secrets or card data in the record.

- [ ] Monthly and annual checkout: price/renewal date/card requirement correct; new eligible trial; abandoning checkout creates no paid access; repeated clicks/two tabs/timeout do not create duplicate subscriptions.
- [ ] Returning canceled-trial customer receives no new trial; early member retains the agreed complimentary expiry.
- [ ] Signed webhook unlocks the correct account; success URL alone cannot grant Plus; duplicate, concurrent, failed and out-of-order delivery tests converge on current subscription state.
- [ ] Portal opens for the correct customer, updates payment method, cancels with the agreed timing; portal remains available if new checkout is paused.
- [ ] Renewal card decline and recovery; 72-hour recovery limit; unpaid/canceled/incomplete/paused states; trial expiry without payment method. Use test clocks where applicable; do not wait days or claim simulated unit fixtures prove Stripe clock behavior.
- [ ] Refund/dispute/fraud signals appear in the restricted review queue; review ownership and response procedure confirmed.
- [ ] Core vs Plus limits tested through direct authenticated database calls as well as UI; mode-mismatched/test grants do not unlock live enforcement.
- [ ] Membership-read/Stripe outage drills preserve recently verified member access within documented windows, with no extra subscription/charge or unsafe auto-upgrade.
- [ ] Disposable account deletion: cancel first, owned media only, all owned database records/Auth removed; another account unaffected; retry on storage/Stripe failure; fresh-sign-in requirement and old-session denial verified against hosted Auth/Storage.
- [ ] Responsive smoke tests at 320/375/768/1440px, keyboard navigation, zoom, profile save, goal completion/history, saved Clarity chats and Village messaging.
- [ ] Client confirms prices, early-member cutoff, privacy/deletion wording, account ownership, portal settings and tax decision.

Live product/price/portal/webhook configuration, production enforcement and public checkout remain **not completed** until separately approved, released and tested. No checklist item should be marked done from a mock test alone.

## Local verification and incident controls

`npm ci --ignore-scripts`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build -- --webpack`, `npm audit`.

The default Turbopack build may be blocked by this desktop sandbox's worker-port permissions; the webpack command runs the supported production builder without deploying. Lint warnings in unchanged legacy screens are not new launch functionality.

For SQL tests, use a brand-new **local disposable PostgreSQL cluster**, never a hosted DB: load `tests/db-bootstrap.sql`, `supabase/schema.sql`, the three previous migrations in timestamp order, the new migration, then `tests/billing-database.sql` with `ON_ERROR_STOP=1`. The assertions roll back their test data; the cluster itself is disposable. Bootstrap simulates roles/Auth/Storage, not real Supabase services.

During an incident, preserve verified billing records and webhook receipts for retry. Pause new checkout and turn database/environment enforcement off in a reviewed change to restore full app access temporarily; do not delete member grants or cancel customers as an outage workaround. Keep portal cancellation/payment recovery available. Re-enable only after configuration/account checks and queued webhook reconciliation pass. Do not roll back the database while app code still depends on its new RPCs.
