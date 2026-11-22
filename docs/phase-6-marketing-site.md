# Phase 6 — adult marketing site

2026-11-22 · `codex/phase-6-marketing-site` · review only, not released.

## Release note

The public adult homepage now follows the approved Arize light design and includes hero, features, free Core/Plus monthly/Plus annual pricing, FAQ, product-interest form, privacy/terms links and safety disclosures. The flower logo and shared adult design tokens are reused. See `design/marketing/README.md` for the reference/adaptation boundaries.

Prices, AI limits, trial lengths and savings come from `lib/access/entitlements.ts`: currently free Core, $1.99/month or $19.99/year for Plus, eligible seven-day card-required trials and a separate fourteen-day early-member offer. **No price or entitlement was changed.** Paid purchase CTAs are not advertised as available in sandbox/paused configuration; Plus CTAs go to updates. Existing members and subscriptions are not altered. There are no Friday Reflection/export/native/voice-cloning promises, unlimited-AI claims, fabricated testimonials, private-data guarantees or Student purchase links.

The public page and lead endpoint bypass only the existing Auth refresh in `proxy.ts`; protected app/Auth routing is otherwise unchanged. Marketing links do not speculatively prefetch authenticated pages. The page can render with no Supabase credentials or active billing service. In-page anchors are native anchors; FAQ uses keyboard-accessible native disclosure controls.

No merge, main push, preview/production deployment, live database operation, Stripe provider call, environment change, real email, real signup, school activation or Student source change was performed. The new migration ran only on a fresh disposable local PostgreSQL cluster with TCP disabled. No new dependencies, paid service, mailing-list integration, analytics, tracking pixel or advertising cookie were added.

## Lead capture and notifications

`POST /api/marketing/leads` accepts only email, a required explicit consent checkbox and the empty website honeypot. The visible checkbox requests adult product-contact permission; this does not create an Arize account or start a subscription. Server normalization rejects malformed/header-injection addresses, extra fields and missing consent. Requests are limited to 2KB JSON, exact configured same-origin requests, and adult mode. The API is private/no-store and never returns lead IDs, stored records, recipients or provider errors. Honeypot submissions deliberately get the generic acknowledgement without being saved.

The additive migration creates two RLS-enabled tables:

- `marketing_leads`: normalized unique email, consent version/time, creation time and minimal notification status/lease/retry metadata. No names, school data, chats, wellness fields, raw request bodies, raw IP addresses or user agents.
- `marketing_rate_limits`: hourly counters with keyed, daily-rotating IP/email pseudonyms and two-hour expiry. Expired counters are removed on capture/maintenance. These pseudonyms are abuse-prevention metadata, not anonymous analytics.

Both tables revoke anonymous/authenticated direct access. Only service-role security-invoker RPCs can capture or manage delivery; there are no new public security-definer functions or browser insert/read policies. Migration and runtime guards refuse a Student schema. Quotas are transactionally serialized: 10 valid submission attempts/IP/hour, 3/email/hour and 1,000 globally/hour. Duplicate submissions count toward quotas but neither overwrite the original consent nor enqueue another notification. Responses do not reveal whether an address already existed.

IP identification trusts the [Vercel-provided IP header](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for) only when running on Vercel. Other hosts and missing/invalid headers share a conservative fallback bucket; self-hosted proxy support must be explicitly reviewed before release. NAT-shared users also share a quota. These controls reduce abuse; they are not a complete DDoS/bot defense, and quotas may need tuning from operational evidence.

**Database save happens first.** New rows remain pending if email configuration is empty or disabled. Notification work runs after the response, so missing recipient settings/provider failure do not falsely tell the visitor their already-saved request was lost. Email is a fixed plain-text staff notification through Resend; it is sent only to the configured owner inbox, never automatically to the submitted address or an arbitrary request-supplied recipient. There is no automatic bulk marketing subscription.

The delivery worker uses a ten-minute exclusive lease, fixed provider URL, redirect rejection, eight-second provider timeout, stable per-lead idempotency key and recipient/template-config fingerprint. Retry backoff is fifteen minutes, max five attempts. It stops at 23 hours from the first attempt—before [Resend's 24-hour idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys)—and sends changed-recipient, exhausted or aged uncertain deliveries to manual review. `sent` means the provider accepted the request, not confirmed inbox delivery. A provider-accepted response whose database finalization failed can be safely retried within that window; it is not a guarantee of exactly-once inbox delivery forever.

Logs contain only fixed state labels, never lead emails, credentials, raw provider errors or request payloads. Counters/recipient fingerprints are not returned to visitors.

## Configuration remains pending by request

`.env.example` documents all settings. None were installed in a hosted environment:

| Setting | Intended use |
| --- | --- |
| `MARKETING_LEAD_CAPTURE_ENABLED=false` | Off until the migration, canonical origin and client privacy/content review are separately approved. Unconfigured UI shows a truthful “updates list opens soon” message and free-account link. |
| `NEXT_PUBLIC_APP_URL` | Exact canonical adult website origin, HTTPS except loopback. Redirect alternate hostnames to it; do not weaken origin checks to wildcard domains. |
| Existing adult `SUPABASE_SERVICE_ROLE_KEY` | Server-only storage access. Never copy Student credentials or expose this value to the client. |
| `MARKETING_RATE_LIMIT_SECRET` | New server-only random secret, at least 32 characters, separate from provider keys. |
| `MARKETING_NOTIFICATION_ENABLED=false` | Outbound staff email stays off until separately configured/tested. |
| `MARKETING_RESEND_API_KEY` | Dedicated adult sending-only key for an approved verified domain; not the Student key. |
| `MARKETING_LEAD_NOTIFY_EMAIL` | **Intentionally blank/configurable** until the client chooses the inbox. |
| `MARKETING_LEAD_FROM_EMAIL` | Bare approved sender address on a verified domain; the display name is fixed to Arize. |
| `MARKETING_MAINTENANCE_APPROVED=false` | Operator-shell approval for a future explicitly authorized hosted maintenance invocation only; never default it on in deployment settings. |

No new subscription or paid email plan is required by this code. Available Resend capacity/domain permissions still need confirmation before real sending. Local values are fictional and not valid credentials.

### Retry, retention and privacy operations

`scripts/marketing-maintenance.mjs` supports bounded batches of up to 20 due notifications and an explicit retention purge. Local checks use `--apply --local-only --retry` and/or `--purge`; local-only mode refuses hosted targets. The future hosted mode additionally requires `--approved-adult-hosted`, `--apply`, `ARIZE_EDITION=adult`, HTTPS, all server configuration and an explicitly approved `MARKETING_MAINTENANCE_APPROVED=true` in the operator shell. **It was not run against a hosted target.** Database guards still refuse Student. Do not enable a scheduler implicitly; no scheduler was created in this phase.

Rows older than 180 days are ineligible for notification and can be deleted by `marketing_purge_expired()`. **Deletion is not automatic merely because a timestamp passes:** an approved operator/cadence must run the purge before capture is activated in a real environment. The client must approve the retention choice and own this procedure. Provider-sent email in the notification inbox has a separate retention responsibility. Legal review may require a different interval.

A new explicit submission for an address whose old record is already past that retention window replaces only that expired record with a fresh request/consent ID. Ordinary unexpired duplicates remain unchanged. This prevents an expired pending row from swallowing a genuine new opt-in.

The product-interest list is separate from Auth accounts and the app's account-deletion workflow; its original anonymous submission has no Auth user ID. Honor contact withdrawal/deletion requests by securely locating/removing the exact lead email and any corresponding notification-email copies. Existing public Privacy Policy provides AmazeGen's contact channel. Do not imply in-app account deletion automatically removes this separately consented marketing record or that this implementation certifies legal compliance. Before sending any consumer newsletter, separately implement/review unsubscribe handling; this phase sends only staff notifications, not consumer campaigns.

## Verification results

| Check | Result |
| --- | --- |
| Adult `npm test` | PASS — 83/83, including 8 marketing tests plus all prior billing, AI safety and Founder tests. |
| Adult typecheck / lint | PASS, zero errors and zero lint warnings. The old marketing `<img>` warning is removed by Next Image. |
| Adult optimized Webpack build | PASS, local only, with fictional loopback storage, sandbox Stripe, checkout/enforcement disabled and notification sending disabled. |
| Migration / local SQL | PASS on fresh PostgreSQL 18 using the actual earlier-phase schema plus marketing migration. Anonymous/authenticated denial, RLS/function grants, consent validation, dedupe, quotas, notification leases/forged-token denial/backoff/retry cap, aged/config-changed delivery review, retention and Student guard all tested. Fixtures roll back. |
| Local HTTP → real SQL | PASS: homepage/prices/Auth destinations; 403 foreign origin; 415 content type; 400 consent/malformed/extra fields; 413 size; honeypot no insert; identical duplicate acknowledgement; concurrent IP quota with 429; no direct browser lead reads. |
| Notifications | PASS with **real local SQL and mocked transport**: nine fictional messages accepted by the mock, state finalized and no repeat claims. Also tested provider 429/5xx retry, 4xx/manual review, missing config and finalization failure. **Zero real emails sent.** |
| Maintenance / rollback | PASS in disposable local fixture only; notifications off, purge returned zero. Marketing-only rollback rehearsed inside a transaction and rolled back; previous billing, console and Founder objects retained. |
| Browser responsive | PASS at 320, 375, 768 and 1280 CSS px: no horizontal page overflow after decorative-shape fix. Logos loaded at 36×33 / 72×66 / 36×33. Keyboard Tab exposes the focus-visible skip link. Shared color-role contrast tests pass; not a full accessibility certification or zoom/device acceptance. |
| Browser interaction | Header/hero/card/Core signup links and both sign-in links reach the expected Auth form; no real account was created. Section navigation, both Plus update links, back-to-top and FAQ disclosure work. Required email/consent block empty submission. Fictional browser lead persisted pending without mail. A missing local capture RPC produced an error, not success, and was restored. |
| No-backend state | Public page rendered with empty Supabase credentials on a temporary local instance; updates form showed the unconfigured notice. |
| Legal links | Both existing external pages resolved: Terms through source read, Privacy in browser. No policy content or agreement was edited/accepted. Client review of new lead retention/contact wording remains separate. |
| Student regression | PASS — 99/99 tests, typecheck, optimized Student build. Separate checkout at `a2a77f1` remains clean and unchanged. |

Review screenshots are fictional local artifacts in workspace `outputs/arize-phase6-2026-11-22/`, not production assets. The fixture Auth adapter is not real Supabase Auth/PostgREST, Stripe or email acceptance. Existing provider acceptance and client launch approvals remain outstanding. CLI 2.75 lacks a local advisor command; local permission/catalog assertions are not claimed as hosted advisor results.

## Reproduce locally

Do not load real keys or run these fixtures against a hosted database. Create a new TCP-disabled PostgreSQL cluster with local role `arize_phase6_test`, socket `/private/tmp/arize-phase6.<random>` and port 55461. Create fresh databases `marketing_tests` and `marketing_ui`. Run `tests/marketing-bootstrap.sql` in each. In the test database run `tests/marketing-database.sql` and `tests/marketing-rollback.sql`; both roll their assertions/rehearsal back.

Point `ARIZE_TEST_SOCKET` to that explicit local socket directory and start:

```sh
node tests/fixtures/marketing-backend.mjs --synthetic-only
```

Use the same fictional environment for build and start (modern Node with TypeScript stripping, matching the project's test runtime):

```sh
env ARIZE_EDITION=adult NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3166 NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-marketing-anon SUPABASE_SERVICE_ROLE_KEY=synthetic-marketing-service NEXT_PUBLIC_APP_URL=http://127.0.0.1:3167 MARKETING_LEAD_CAPTURE_ENABLED=true MARKETING_RATE_LIMIT_SECRET=fictional-marketing-rate-secret-not-real-123 MARKETING_NOTIFICATION_ENABLED=false STRIPE_EXPECTED_MODE=test BILLING_ENFORCEMENT_ENABLED=false STRIPE_CHECKOUT_ENABLED=false NEXT_PUBLIC_BILLING_CHECKOUT_ENABLED=false npm run build -- --webpack

env ARIZE_EDITION=adult NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3166 NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-marketing-anon SUPABASE_SERVICE_ROLE_KEY=synthetic-marketing-service NEXT_PUBLIC_APP_URL=http://127.0.0.1:3167 MARKETING_LEAD_CAPTURE_ENABLED=true MARKETING_RATE_LIMIT_SECRET=fictional-marketing-rate-secret-not-real-123 MARKETING_NOTIFICATION_ENABLED=false STRIPE_EXPECTED_MODE=test BILLING_ENFORCEMENT_ENABLED=false STRIPE_CHECKOUT_ENABLED=false NEXT_PUBLIC_BILLING_CHECKOUT_ENABLED=false npm start -- --hostname 127.0.0.1 --port 3167

node tests/fixtures/marketing-smoke.mjs --synthetic-only
node tests/fixtures/marketing-notification-smoke.mjs --synthetic-only
```

The HTTP smoke script assumes a fresh UI database/hourly quota: it inserts fictional `.test` addresses and intentionally exhausts the fallback IP bucket. Recreate a fresh disposable fixture or explicitly clear only its test rate counters before repeating. Never clear hosted quotas to make tests pass. The notification smoke script uses a hard-coded mock transport and cannot send real email. No browser fixture creates real accounts.

## Review and future release

This is one stacked PR based on Phase 5 PR #6 (`codex/phase-5-founder-dashboard`, `5e7b211`). Earlier adult phases remain review dependencies; do not merge Student PR #4 into this lineage. The user's untracked Nov 19 audit is excluded.

`vercel.json` explicitly disables Git deployment for this branch and previous review branches. No main push, preview/production build or build-machine change is authorized. The previously observed adult Vercel project/repository-link mismatch (`amazegen/arize2.0` versus this repo) is not changed here; resolve it before a future approved deployment.

Before real capture: approve client-facing wording/retention/withdrawal ownership, approve/install the adult-only migration, set canonical origin and independent rate secret, then enable capture only after a controlled acceptance test. Before sending: choose the owner inbox and verified sender, securely install a dedicated adult sending-only key, approve/test real delivery, set a retry/purge owner/cadence and only then enable notifications. None requires activating paid memberships; leave Stripe sandbox and subscription launch paused until separately authorized.

Rollback before release is reverting/discarding this branch. After an approved future installation, disable capture and notifications first, revert the code, and preserve/export lead consent records as needed before any explicitly authorized schema removal. `tests/marketing-rollback.sql` enumerates only new marketing objects; it is a local rehearsal, not permission to delete hosted records. No prior app/billing/Student table or credential needs rollback for this phase.
