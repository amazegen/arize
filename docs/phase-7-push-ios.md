# Phase 7 — adult browser reminders and iOS foundation

Review branch: `codex/phase-7-push-ios`, stacked on `codex/phase-6-marketing-site`.
This is the approved **first slice**, not a complete native release.
The later [native accounts/features continuation](phase-7-native-features.md) records the optional connected build and supersedes this starter's offline-only limitations; its release gates still apply.

## Boundaries respected

No merge, main push, Vercel preview/production deployment, hosted database query/migration, scheduler, real notification, Stripe provider operation, Apple portal action, signing or upload. Stripe stays sandbox; subscriptions and Reflect are unchanged. The separate Student checkout was not edited. `vercel.json` disables Git deployment for this branch before it is pushed.

## Browser reminders built

- Profile has an optional reminder card using the adult theme, with daily time, explicit IANA time zone, enable/save/disable, pending/error/unsupported states and privacy explanation. Permission is requested only by **Enable on this browser**. Declining does not restrict any app feature.
- A dismissible in-app suggestion becomes eligible after a saved check-in, completed goal or saved Clarity conversation containing both a user and assistant turn. Login or a greeting alone does not qualify. It never opens an OS prompt automatically. The suggestion is suppressed in unsupported/permission-denied browsers and after session dismissal. It refreshes on navigation, so a goal completed in place may show it on the next page.
- All controls require a verified cookie-session user, canonical same-origin request, small JSON body, exact action/field allowlist, current legal acceptance and no pending deletion. User IDs never come from request bodies. The safe state DTO excludes endpoints and encryption keys.
- The additive migration creates three RLS-enabled, service-only tables. No anonymous/authenticated direct table grants or service-function execution. Functions are invokers with an empty search path, not public security definers. It refuses installation on a Student backend and runtime eligibility also refuses Student.
- Each account can opt in up to five browser devices. A registered endpoint cannot silently move to another account. Time is shared across enabled devices; unsubscribe affects only the current browser. Signing out attempts server disable and locally unsubscribes even during a server outage; other Auth sign-out paths have local unsubscribe cleanup. Account removal cascades preferences, subscriptions and queued jobs.
- The dispatcher uses an independent bearer secret and a separate send flag. It revalidates endpoint hosts/keys and rechecks the lease, deletion and preference version immediately before sending. It never follows arbitrary user URLs. Only exact Apple, Mozilla and Google push-service hosts/path families are accepted; unsupported providers fail closed.
- One daily job per subscription/local date, atomic leases with `SKIP LOCKED`, maximum three attempts, one-minute transient-failure backoff, expired/gone endpoint removal, schedule revocation and a 15-minute due window. Historical delivery-job metadata is pruned after 14 days during dispatch. Active subscriptions/preferences remain until disabled, expired or account deletion.
- Generic fixed lock-screen title/body only; no chats, moods, goals, names, user IDs, clinical information or private deep links. The service worker ignores incoming content/URLs, opens `/home`, and deliberately has **no fetch handler or private-page cache**. It does not add offline caching of authenticated app pages.
- A standalone web manifest uses the approved adult sun SVG. Final square raster Home Screen/App Store artwork still needs preparation and physical iOS installation testing; the existing flower logo remains inside the app. This is not a claim of universal install-prompt compatibility.

### Timing, reliability and limits

Schedule uses the selected IANA zone, not a fixed UTC offset. Postgres resolves a spring-forward gap by moving it forward and a repeated fall-back hour to its standard-time occurrence. A unique local-day key prevents two scheduled deliveries on that date. Changing a time cancels pending work; a device already queued that day may not receive a replacement until the following day. There is no hours-late catch-up.

A notification already accepted by a provider cannot be recalled. A timeout can be ambiguous; leases and a stable provider topic/device tag reduce duplicates but do not promise exactly-once delivery. OS Focus, network, battery and push-service behavior affect delivery. The library's 5-second timeout is an inactivity/socket timeout; the hosting route also has a 120-second ceiling and expired leases can recover.

The worker claims at most 20 jobs per invocation and sends up to four concurrently. **No scheduler was created.** Before a real rollout, choose and load-test cadence/capacity for peak simultaneous reminders; a once-per-minute run alone is insufficient for 1,000 users choosing the same 15-minute delivery window. Do not describe this phase as a 1,000-device load test. A scheduler may incur existing hosting usage; no new notification SaaS subscription was added.

### Configuration (placeholders only)

All switches are **false in `.env.example`**. No real secrets were read, copied or installed.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_BROWSER_PUSH_ENABLED` + `BROWSER_PUSH_ENABLED` | UI and authenticated reminder API; both must be true after approval |
| `BROWSER_PUSH_SEND_ENABLED` | Independent delivery kill switch; leave off until provider/device acceptance |
| `NEXT_PUBLIC_BROWSER_PUSH_VAPID_PUBLIC_KEY` | Dedicated adult Web Push public key, safe in client bundle |
| `BROWSER_PUSH_VAPID_PRIVATE_KEY` | Corresponding server-only private key; never shared with Student |
| `BROWSER_PUSH_CONTACT` | Monitored `mailto:` contact for VAPID |
| `BROWSER_PUSH_DISPATCH_SECRET` | Independent server-only random secret, 32+ characters |
| `NEXT_PUBLIC_APP_URL` | Exact canonical adult origin; no wildcard/alternate-host bypass |
| Existing adult Supabase variables | Same adult backend, never Student credentials |

The future scheduler must POST to `/api/notifications/dispatch` with the bearer secret. It has no public GET cron handler. The browser route is POST `/api/notifications/browser` with `state`, `register`, `schedule` or `disable`. Never put endpoints, keys or the dispatcher secret in query strings or logs. Key rotation needs a controlled re-subscription plan; do not swap a VAPID pair without testing existing devices.

## iOS foundation built

`apps/mobile` is an independently locked React/Vite + Capacitor package. It bundles local `dist` assets into an unsigned Swift Package Manager iOS project. There is **no `server.url`**, remote app-shell loading, production allow-navigation wildcard or embedded server credential. It does not modify the Next build into a static export.

The starter has the Arize flower logo, adult palette, responsive Home/Grounding/Settings screens, a complete optional three-step grounding flow, keyboard focus/announcements, native-only light haptics, explicit native-only local reminder permission/scheduling/cancel controls, crisis resources and the adult privacy/terms links. Browser preview clearly labels device-only features and disables them. The exercise works from bundled assets; it does not save private health information.

Native reminders are **on-device local notifications, not APNs remote push**. Only enabled/time preference is saved via Capacitor Preferences. The app-level `PrivacyInfo.xcprivacy` declares the UserDefaults reason `CA92.1`, is included in Xcode Resources, and currently declares no collected/tracking data for this offline starter. Revisit the manifest and App Store labels when account/AI/analytics features are connected.

This starter deliberately has no fake logged-in state or pretend Goals/Clarity/Village tabs. The existing cookie-session/server-rendered Next routes cannot simply become bundled native screens. Auth/deep links, secure token lifecycle, shared data/UI extraction and native adaptations for those workflows are **not finished**. The local `com.amazegen.arize.dev` bundle ID is unregistered; no signing team is selected. Generated Capacitor launcher/splash artwork is still a placeholder, not approved store branding.

Local commands, from `apps/mobile`:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run ios:sync
npm run dev
```

`npm run ios:add` generates a new project only if none exists; do not run it over the committed project. `ios:sync` copies the bundle and updates SPM references; it does not compile, sign or upload. Local browser preview uses `http://127.0.0.1:3173`. Development-only HMR CSP exceptions are stripped from the bundled production HTML.

## Verification receipt — November 22, 2026

| Check | Result / scope |
| --- | --- |
| Adult typecheck, ESLint, tests | PASS; 93 Node tests, including real SDK offline encryption, validation, transport outcomes and service-worker execution. No real provider delivery. |
| Adult optimized Next/Webpack build | PASS locally against fictional loopback settings; no push import warning. Existing warning about an enclosing workspace lockfile remains. |
| Actual SQL permissions/queue tests | PASS on fresh PostgreSQL 18 socket-only cluster. Roles, ownership, device cap, quotas, leases, duplicate prevention, retry, expiration, deletion, revocation, DST and Student refusal. Fictional fixtures rolled back. |
| Browser API + real local SQL | PASS: unauthenticated 401, foreign origin 403, malformed/forged/SSRF input 400, ineligible 409, register/state 200, no-store, manifest/worker, secret-protected disabled dispatcher. Synthetic Auth adapter, **not hosted Supabase Auth acceptance**. |
| Schema rollback rehearsal | PASS locally inside a transaction; notification objects removed and rehearsal rolled back; prior billing/console/founder/marketing objects retained. |
| Browser visual/function checks | Reminder card at 390/768/1280 widths, no horizontal overflow. Unconfigured key reports a safe error before requesting permission. Native web preview grounding start/next/skip/finish and disabled browser device controls pass, no console errors observed. |
| Mobile typecheck, 4 Node tests, Vite bundle + Capacitor iOS sync | PASS locally; time/preview guards, generic preferences, privacy resource checks, bundled assets and three native plugins copied. Native API behavior still needs a device. |
| Native project/plist checks | PASS `plutil` syntax for Info.plist, privacy manifest and Xcode project. **Not a native compilation.** |
| Student regression | PASS separate checkout: 99 tests, typecheck, optimized build; clean worktree at `a2a77f1`. No Student source/config/migration changes. |
| Dependency audit | No known vulnerabilities reported by npm for either lockfile at installation time. |
| Physical browser push / native device behavior | NOT RUN. Permission/provider/device/Focus/background/DST/travel acceptance remains pending. |
| Xcode compilation, signing, archive, TestFlight/App Store | NOT RUN. Selected developer directory is `/Library/Developer/CommandLineTools`; full Xcode is not installed/configured. No Apple access or upload attempted. |

New migration: `supabase/migrations/20261122202604_browser_push.sql`, generated using the Supabase CLI. Apply **only to a separately approved adult test target first**, never the Student database. SQL fixtures use `tests/marketing-bootstrap.sql`, then this migration, `tests/browser-push-database.sql` and `tests/browser-push-rollback.sql` in a brand-new local DB. The loopback-only HTTP adapter/smoke live under `tests/fixtures/browser-push-*`; its Auth and keys are explicitly fictional and it refuses non-temporary socket targets. No hosted advisor results are claimed.

Screenshots outside the repository: `outputs/arize-phase7-2026-11-22/browser-reminders-phone.jpg` and `ios-foundation-phone.jpg` under the More Life Consulting workspace.

## Remaining release gates (not silently marked complete)

1. Approve adult-only migration installation, privacy wording/provider retention/owner, a dedicated VAPID pair and monitored contact. Test with a controlled real adult account on Chrome/Firefox and an installed iOS Home Screen app; test deny, enable, schedule, disable, sign-out, account switch, account deletion and provider expiry. Safari iOS/iPadOS Web Push requires an installed Home Screen app and explicit user action. See [WebKit's guidance](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
2. Approve and load-test a scheduler/cadence, monitoring and a kill-switch owner. Prove notifications stay generic and that private pages are not cached. Do not enable actual sending simply because this PR is merged.
3. Install/select full Xcode with a compatible iOS SDK and run a local simulator/device compile. Confirm Curtis-owned bundle identity and artwork. Native permission/notification interaction, timezone changes, offline cold launch, font scaling/VoiceOver, safe areas, background behavior and real haptics still need device tests.
4. Implement native account/session/deep-link flow and actual adult Goals/Clarity/Village/Profile workflows without shipping server keys. APNs remote registration/delivery is a separate later step if required. No native notification access to Student.
5. Resolve App Store gates before any upload: current minimum-functionality review, third-party AI disclosure/consent, privacy labels/policy accuracy, account-deletion acceptance, Village report/block/moderation, privacy-compatible sign-in alternative if third-party sign-in is retained, and storefront-specific subscription/IAP rules. Hiding Stripe controls is not by itself an App Store compliance solution. This foundation has no purchase controls; web billing is unchanged/sandbox.
6. Prepare reviewer demo access, submission notes, support URLs and signed build only with separate approval. No promise of approval or finished packaging from this phase. Resolve the already-documented adult Vercel repo-link mismatch before any future single-batch deployment; it was not changed here.

Implementation references: [Capacitor config](https://capacitorjs.com/docs/config), [local notifications](https://capacitorjs.com/docs/apis/local-notifications), [Preferences privacy manifest](https://capacitorjs.com/docs/apis/preferences), [Web Push library](https://github.com/web-push-libs/web-push). Review current Apple rules again when planning a submission; no store submission is authorized now.

## Rollback

Before release, discard/revert this review branch. After a future authorized installation, turn off UI/API and sending flags first, stop the scheduler, then revert code while preserving opt-in records as needed. Schema removal is destructive and needs its own approval; the local rehearsal is not permission to drop hosted data. Browser unsubscribe and OS settings control already registered devices; a service-worker update cannot recall a delivered notification. The native project is independent and can be left unshipped without changing the adult website or Student app.
