# Core / Plus sandbox acceptance — Phase 2

Updated November 19, 2026. Continue existing draft PR #2; do not merge or deploy from this checklist. **Core is free. Plus is $1.99/month or $19.99/year**, seven-day card-required trial for eligible new customers, fourteen-day complimentary early-member offer only when separately approved. Reflect and the Friday Reflection stub are unchanged by request.

## Current results — do not confuse these with provider acceptance

| Check | Actual result | Evidence / limit |
|---|---|---|
| Branch baseline | PASS | PR #2 at `50f5d83` already based on current remote main `beff76d`; no rebase needed and no main mutation. |
| Local workflow/regression tests | PASS | 51 Node tests: checkout/portal fakes, cancellation-before-deletion and retry ordering, event replay/busy handling, real SDK signature verification, exact 72-hour and six-hour boundaries. No Stripe API requests. |
| Local database enforcement | PASS | `tests/billing-database.sql` against a fresh local cluster, current schema + upgrade script + billing migrations. Synthetic fixtures rolled back. Supabase Auth/Storage are simulated, not actual services. |
| Real Stripe sandbox lifecycle | BLOCKED | Stripe connector requires reauthentication. Shared login password accepted, but sign-in requires the account owner's passkey. No email-code alternative was offered; backup-code recovery would remove two-step authentication and was not used. Use the existing invited administrator login instead. No account password is stored in this repo/document. |
| Hosted Auth / Storage deletion | NOT RUN | No live database access permitted. Needs a separately authorized disposable non-production Supabase stack/tester account. Local cascade/order tests do not prove hosted Auth/Storage deletion. |
| Logged-in responsive pass | PASS, fixture scope | 14 routes × 375/768/1280 CSS px = 42 loaded-route checks, no horizontal document overflow. Fictional loopback account; billing disabled/Plus rollout view. Not real account/provider acceptance, every Core/error/keyboard/mobile-device state, or a redesign. |
| Typecheck / lint / build | PASS | Typecheck and Webpack build passed; lint has 0 errors / 4 existing warnings. Student regression suite remains 89/89, with no Student file changes. PR stays draft while real sandbox acceptance is blocked. |

## Safety/setup checklist

1. Sign in with **your own invited Stripe administrator email**, not the owner's shared login. In the account picker select **AmazeGen**, then the intended **sandbox**. Verify the sandbox banner before any action. If missing, ask Curtis to confirm/resend your invitation and sandbox access. Never enter a backup code to remove security just to unblock testing.
2. Use only newly created disposable test customers and a separate local/non-production application backend. Never point these tests at the adult production database or Student pilot. Never cancel an existing real subscription, even if the dashboard contains test data nearby.
3. Confirm Core/Plus offer and sandbox account ID, monthly/yearly Price IDs and explicit portal configuration. If missing/mismatched, stop that provider test and record the blocker; do not create live products. The runtime checks exact price amount, USD currency, recurrence, active Product and test mode.
4. Securely supply the existing `.env.example` variables to the local/non-production app: sandbox restricted Stripe key, expected mode `test`, sandbox account, both prices, portal configuration, webhook secret, non-production Supabase settings/service key, app origin and independent continuity signing secret. Do not paste values into chat, commands, PRs or this evidence record. No production credential download is required for this phase.
5. Review/apply the existing mainline enforcement migration **only to a fresh disposable local environment** for these tests. It defaults disabled. Enable its test-mode gate and matching app flags only inside that isolated environment. If real Supabase services are unavailable, report their acceptance pending rather than substituting a mock pass.
6. Start the app locally. Read-only `npm run billing:check` validates configuration. `npm run billing:verify` performs Stripe GET requests after variables are securely supplied; it does not validate a webhook secret or perform checkout. Do not run it against live mode during Phase 2.
7. For real signed deliveries to a local backend, authenticate Stripe CLI to the approved sandbox and use `stripe listen --forward-to http://127.0.0.1:3149/api/billing/webhook`. Securely install that listener's signing secret locally, not a different endpoint's secret. Do not create a Vercel preview. The CLI is not installed/configured in the current workspace, so this step remains pending.
8. Keep a sanitized record: scenario, timestamp, tester alias, sandbox account/mode, session/subscription/event ID, expected/actual result. Never record keys, passwords, card payloads, full events or personal chat contents. Mark simulation versus real provider clearly.

## Click-by-click provider scenarios

### A. Monthly Plus checkout and trial

1. Create a disposable, email-confirmed application tester; accept current Terms/Privacy. Use a fresh tester for annual coverage so trial eligibility is independent.
2. App → **Profile & Settings → Membership → upgrade**. Confirm Core is free and Plus monthly is **$1.99**.
3. Click **Continue with monthly**. Confirm the hosted Stripe Checkout page is the intended test/sandbox session, correct product/price, seven-day trial and card requirement.
4. Use Stripe's published success card **4242 4242 4242 4242**, a future expiration and fictional CVC/address. Never use a real card. Finish checkout.
5. In sandbox Dashboard → **Customers** → the new test customer → subscription, confirm `trialing`, monthly recurrence and expected trial end. Check Workbench delivery succeeds.
6. Return to the app, refresh Membership and confirm Plus. A success URL alone must not grant Plus; before signed synchronization, the app must not fabricate a paid grant.
7. Repeat double-click/two-tab/retry attempts for the same tester. Confirm one billable subscription, not duplicates. Abandon a separate checkout; it must not grant paid access.

### B. Annual Plus checkout

1. With a different fresh tester repeat A, choosing **Continue with annual**.
2. Confirm **$19.99/year**, annual recurrence, correct seven-day trial/card requirement, signed delivery and correct tester's Plus grant.
3. Before completion, switch a disposable open monthly checkout to annual; confirm the old open session is expired/replaced, not two subscriptions.
4. On a tester whose earlier trial/subscription was canceled, a new checkout must not restart the introductory trial. Test the separately approved early-member grant preserves a longer remaining complimentary expiry; do not assign early trials to real users or invent a launch date.

### C. Portal, cancel and undo scheduled cancellation

1. On the test subscription, App → Membership → **Manage membership**. Confirm the portal belongs to that customer.
2. Update its test payment method. Check the sandbox customer/subscription changed correctly.
3. Cancel with the approved **end-of-period** policy. Record its cancellation/end date; app access lasts to that date, without an extra speculative renewal extension.
4. Before that date, use the portal's cancellation-undo/renew control if enabled in the approved configuration. Confirm `cancel_at_period_end=false` after signed sync. If that control is unavailable, record the portal setting gap—do not silently change account settings.
5. A fully canceled subscription cannot simply be resumed by toggling UI state; a new checkout must respect trial eligibility. A paused-subscription resume event is a distinct case; confirm that lifecycle separately if pause/resume is supported.
6. In the isolated test app pause **new checkout only**. An existing test member must still be able to open the portal for cancellation/payment recovery. Restore test flags after the scenario; do not change production flags.

### D. Failed renewal and recovery

1. In the sandbox Dashboard → **Subscriptions**, open a disposable subscription and use **Run simulation** / a test clock, following the current Billing testing guide linked below. Confirm all objects belong to that sandbox/test clock.
2. Attach the documented failure-after-attachment card **4000 0000 0000 0341** to the disposable customer as the subscription's default payment method; use Stripe's documented PaymentMethod fixtures for API tests instead of sending raw card numbers from server code.
3. Advance to a renewal after a successful paid period, wait for simulation/invoice finalization and inspect `invoice.payment_failed` and its `billing_reason`. Separately test failure at the first post-trial charge. Current code qualifies grace using `billing_reason=subscription_cycle`; confirm the intended first-post-trial policy with the client rather than assuming that flag proves an earlier successful paid period.
4. Confirm qualifying failed renewals receive a bounded 72-hour recovery expiry; the event is not discarded, and unknown/unpaid/incomplete/canceled states do not get speculative paid access.
5. Replace the test payment method through the app's portal with the success test card, then retry the test invoice using the Dashboard. Wait for `invoice.paid` and subscription synchronization; verify recovered access.
6. Test the expiry branch independently. **Stripe test clocks do not advance the application's wall clock or a cookie's expiry.** Use controlled local application-clock tests below for exact 72-hour/six-hour boundaries; do not claim a simulated Stripe clock alone proves app-time expiry. Do not add a production time-travel endpoint or alter real system time.

### E. Duplicate/replayed webhooks

1. In sandbox **Workbench → Webhooks/event destinations → intended test endpoint**, choose one successfully delivered subscription/invoice event and note its sanitized `evt_` ID.
2. Use **Resend** twice for a configured test endpoint. For a local CLI listener, use Stripe's documented local forwarding/replay workflow; do not register a `localhost` URL as a public HTTPS destination or send traffic to production. Preserve the **same event ID**, rather than generating two different events of the same type.
3. Confirm one processed ledger row for that ID, no additional subscription/grant/charge, and a duplicate acknowledgment. Busy/failed work should retry, not be falsely acknowledged as processed.
4. Test out-of-order subscription updates and a transient sync failure. Final state must match Stripe's current subscription, not the older embedded snapshot.
5. Local signature tests cover original bytes, wrong secret, tampering and stale timestamps; a locally generated signature is not evidence that the configured provider secret is correct.

### F. Renewal grace and continuity outage

1. Run `npm test` for controlled boundary tests: active renewal valid at 72 hours minus 1 ms and Core exactly at 72 hours; scheduled cancellation not extended; recovered/terminal states correct.
2. Run the disposable SQL suite to confirm database policies agree: 71-hour stale active renewal accepted; exact 72-hour expiry, known cancellation and expired failed-payment grace denied.
3. With an eligible verified **test** member, ensure `/api/billing/access` has issued the signed HttpOnly continuity cookie. In the isolated app, simulate membership-read failure without deleting grants or canceling anything.
4. Confirm the original user retains the bounded recent snapshot, another user cannot reuse it, and the cookie is not re-minted during the outage. Restore the dependency and confirm fresh successful Core checks clear continuity when appropriate.
5. Local tests prove token expiry at exactly six hours and refusal to refresh an outage snapshot. Cookie protection does not restore unavailable database content or override database RLS; record which actual UI operations remained available in the real dependency drill. That drill remains pending here.

### G. Account deletion and retry

1. Use only a disposable consenting tester with a sandbox subscription, synthetic app records and owned test media. Record another tester to prove isolation. This permanently deletes the designated test account: obtain per-action confirmation if an agent performs the UI submission.
2. App → Profile & Settings → **Delete account**. Verify recent sign-in is required (within 15 minutes), typed `DELETE MY ACCOUNT` and the separate acknowledgment.
3. Confirm sandbox subscription cancellation occurs **before** owned media and Auth identity deletion, without final invoice/proration. Then verify removal of the reusable test Stripe customer, owned Storage files, Auth user and cascading application records.
4. Ensure another tester's identity/data/media remain unchanged. An old access token must not continue reading/writing after deletion begins or identity is removed.
5. Independently simulate Stripe, Storage and Auth failure in the isolated test environment. Do not falsely report success; keep a retry path and stage receipt. Retry safely without double billing or deleting another account.
6. Stripe financial records, provider logs and backups can have separate retention. Do not promise immediate deletion of every retained copy. Do not perform this test on Curtis, Shelby, yourself or a real participant.

### H. Core/Plus direct enforcement

1. In the disposable backend, verify Core: 3 active goals, current-week goal history, 7-day check-in/Pattern history, latest 3 Clarity chats, 5 requests/day and 20/month, Wins Only text, no media.
2. Try direct authenticated database/RPC access, not only hidden buttons: self-granting Plus, increasing quotas, fourth active goal, premium room join, older histories and media upload must be denied appropriately.
3. Verify Plus full histories/goals, all Village rooms/media, 30 AI requests/day and 300/month. Existing reports/exports entitlement flags are not implementations of new report/export features.
4. Test mode-mismatched grants and missing configuration fail safely, then verify returning to disabled rollout preserves full product access without altering subscriptions.

## Responsive evidence and how to repeat it

Routes checked at **375/768/1280**: `/home`, `/reset`, `/reset/history`, `/reset/complete`, `/goals`, `/goals/session`, `/goals/patterns`, `/goals/friday-reflection`, `/coach`, `/village`, a room, `/settings`, `/upgrade`, `/feedback`. Data-bearing client routes were checked after fixture rows loaded, not just during initial loading. Saved Clarity history opened and resumed; long room text wrapped; goal-session controls and membership cards were visually inspected on phone width. The home card's clipped decorative circle is intentional, not document overflow. No layout-source changes were necessary from these observations.

Test-only helper: `node tests/fixtures/adult-layout-backend.mjs --synthetic-only`. It binds **127.0.0.1:3148**, accepts only fictional `layout@example.test` / `layout-fixture-only`, has no external calls/persistence and rejects data mutations. It is not imported by the app or a production auth bypass. Build/start a local app with public Supabase URL `http://127.0.0.1:3148`, anon value `synthetic-layout-only`, app URL `http://127.0.0.1:3149`, billing enforcement/checkout flags false and test mode. In that local browser sign in to the fictional account, skip the intro and inspect each route at the three widths. Stop both local servers afterward and rebuild normally before using another environment. Realtime, uploads, actual auth security and billing operations are intentionally unsupported by the fixture. Real Core/Plus/error/keyboard/zoom/device acceptance remains separate.

## Required before marking PR #2 ready

- [ ] Complete the actual AmazeGen sandbox scenarios above and save sanitized outcomes.
- [ ] Complete real disposable Supabase Auth/Storage deletion and dependency-outage acceptance, not just mocks/SQL.
- [ ] Confirm missing adult history tables/migration prerequisites in an authorized non-production copy; do not query/change the live database in Phase 2.
- [ ] Resolve production repository provenance (`amazegen/arize` versus Vercel's `amazegen/arize2.0`) before any later release. No repointing is authorized here.
- [ ] Client confirms offer, cancellation/dunning/early-member policy, tax decision and legal/deletion wording.

Until required acceptance is recorded, leave PR #2 **draft**. No merge, deployment, hosted migration, subscription launch or live billing changes are authorized by this document.

## Primary references

- [Stripe test cards and fixture usage](https://docs.stripe.com/testing)
- [Billing simulations, renewal/trial and failure testing](https://docs.stripe.com/billing/testing)
- [Webhook local listener, signature checks and resend guidance](https://docs.stripe.com/webhooks)
