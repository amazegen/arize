# Phase 7 — real local acceptance and remaining iPhone gates

Historical receipt: [November 23 compilation/startup update](phase-7-acceptance-2026-11-23.md) supersedes the missing-Xcode blocker below. Native visual/device acceptance is still pending.

Continuation on the existing draft PR #9 / `codex/phase-7-native-features`. **Phase 7 is not fully finished.** No merge, deployment, hosted/live database access, Stripe provider operation, Apple portal change, signing or upload was performed. Student remains untouched at `a2a77f1`. Subscriptions remain paused and all billing test configuration stays sandbox-only.

## What changed in this continuation

- Created an unlinked temporary Supabase stack with actual GoTrue Auth, PostgREST, Realtime WebSockets, Storage and Mailpit. It contains only fictional `@example.test` accounts. The adult schema was replayed on a verified empty local database; no Auth table mocks or broad fixture grants were added. No new application migration was needed.
- Verified every published API/database/mailbox port binds to **127.0.0.1 only** before adding app records. CLI 2.75 explicitly bound ports to all interfaces, so the three new test containers were recreated with loopback bindings; their stopped originals and volumes were retained for recovery. Only the named `arize-native-acceptance` stack was affected. The existing Docker engine was started; no paid service was created.
- Added guarded local setup/server/test helpers. They reject linked/hosted targets, wrong project labels and non-loopback bindings. Local server traffic is allowlisted to the test stack and mock AI; all hosted AI/Stripe/database fetches are blocked. Keys are obtained from local CLI status inside the process, not copied from Vercel or committed.
- Finished native Clarity message pagination beyond the prior 200-message cap. Real `coach_messages.id` is a bigint identity, not a UUID: page cursors and returned IDs now preserve text precision. Tested equal timestamps, all 205 messages, no duplicate/omitted IDs and cross-user denial. Loading earlier messages preserves the visible reading position; opening/sending in a long chat jumps to the latest turn. Secondary history refresh no longer holds the send control after a reply arrives, and history loading no longer pretends AI is generating.
- Added a Village re-fetch when PostgreSQL acknowledges subscription readiness, not merely when the socket joins. This closes an initial/reconnect timing gap. Existing manual-refresh fallback remains. Village stays text-only; no recording, upload or media playback was introduced.
- Added `npm run ios:check` and `npm run ios:build:simulator` in `apps/mobile`. The first is read-only preflight; the second builds **only when explicitly invoked**, only for the iOS Simulator and with code signing disabled. Neither accepts licenses, changes global Xcode selection, archives, provisions or uploads.

## Verification receipt

| Check | Result / limits |
| --- | --- |
| Adult typecheck / ESLint / Node tests | PASS; 99 tests, zero lint warnings. |
| Mobile typecheck / Node tests / bundle | PASS; 11 tests, default-offline and connected browser-only local configurations. |
| Adult optimized Webpack build | PASS against the actual local backend. Existing enclosing-workspace lockfile warning remains. |
| Actual local Auth and setup | PASS verified sign-in, legal/AI setup, unconfirmed denial, duplicate signup, locally captured confirmation/recovery emails, same-device PKCE, one-use callback, wrong-device/expired-flow refusal and password replacement. Emails stayed in Mailpit; no external delivery. This does not prove an iPhone opens the custom URL. |
| Sessions and MFA | PASS actual refresh, global session revocation with an old JWT, banned-account login denial, real TOTP enrollment/verification, aal1 refusal and aal2 acceptance. Keychain/OS lifecycle are **not** exercised by Node/browser tests. |
| Core/Plus and owner isolation | PASS sandbox-only local membership resolution, real goal cap, preserved completion, foreign-account HTTP denial and direct RLS denial. Actual local membership-RPC failure preserves signed known-Plus continuity without renewing the token or giving Core speculative Plus. No Stripe API call. |
| Clarity | PASS actual quota/ledger/atomic database history and cached retry; input/output safety pipeline uses a **mock AI provider**, not OpenAI. Crisis input produces fixed resources and no ordinary conversation. Real 205-message paging and equal timestamps pass. |
| Village | PASS actual two-account WebSocket delivery, text deduplication, room join/leave/access denial and Core room restriction. This does not certify production settings, sustained load, background iOS behavior or long-offline catch-up. |
| Account deletion | PASS actual removal of a fictional Auth account/profile and owned app data after session revocation. The fixture had no billing customer; subscription cancellation remains covered by existing mocked workflow tests, not a real Stripe operation. |
| Browser visual regression | PASS at 390×844: real-local sign-in, 200→205 message loading with scroll anchor preserved, continued saved conversation, immediate latest-turn positioning, text-room send, no horizontal overflow observed and no captured console errors. This is not an iPhone hardware test. |
| Native source/package | PASS latest default-offline bundle + Capacitor sync, plist/project syntax and Swift syntax parse. A separate connected browser bundle was rebuilt afterwards, **not** synced to iOS. |
| iOS preflight / compilation | **BLOCKED:** full Xcode is not installed; selected directory is CommandLineTools and no simulator is available. `ios:check` correctly exits 2. No simulator/device compilation, signing or installation is claimed. |
| Student regression | PASS 99 tests in the separate unchanged checkout; worktree remains clean. No Student settings or database access. |

Local versions tested: Supabase CLI **2.75.0**, Postgres image **17.6.1.075**, Auth **2.186.0**, PostgREST **14.3**, Realtime **2.73.2**, Storage **1.35.3**, Mailpit **1.22.3**, Kong **2.8.1**. These are the pinned local CLI stack, not a claim that the hosted apps have identical versions. No hosted advisor or compliance certification is claimed.

## How to resume safely

The current temporary stack directory is `/private/tmp/arize-native-services.IlH5kn`; it is not linked to any project. Set `ARIZE_NATIVE_SERVICES` to that directory for the guarded helpers. APIs: localhost **56581**; database **56582**; local mail viewer **56584**; adult acceptance gateway **3190**; mock AI **3191**; browser client **3183**. These endpoints contain fictional data only.

From the adult repository root:

```sh
ARIZE_NATIVE_SERVICES=/private/tmp/arize-native-services.IlH5kn node tests/fixtures/native-services-server.mjs build --synthetic-only
ARIZE_NATIVE_SERVICES=/private/tmp/arize-native-services.IlH5kn node tests/fixtures/native-services-server.mjs serve --synthetic-only
# Separate terminal, then the real local suite:
node tests/fixtures/native-services-ai.mjs --synthetic-only
ARIZE_NATIVE_SERVICES=/private/tmp/arize-native-services.IlH5kn node --experimental-strip-types tests/fixtures/native-services-smoke.mjs --synthetic-only
```

The suite leaves clearly fictional accounts/records for inspection; do not run it against a hosted database. Repeated runs use new identities, so local Auth rate limits may require waiting between runs. It never bulk-deletes unknown accounts or disables row security. Its temporary membership-RPC permission change is restored in `finally`; interruption during that check should be followed by the documented grant to `authenticated` on the local stack only. The stopped original local containers are not backups of current test data; they share local volumes and must not be started alongside the replacements.

For a new stack, use a brand-new `mktemp` directory, `supabase init` and the fixture `native-services-config.toml`; never link it. Start only the required services with the pinned CLI, stop/rebind the three published containers using the guarded loopback helper **before any app seed**, then apply `tests/native-services-bootstrap.sql` locally. Check actual bindings; do not assume the Docker bridge default overrides explicit CLI binds. The loopback helper supports `--enable-local-totp` for the original CLI-generated Auth config, not a production Auth setting. Do not run destructive reset/cleanup on arbitrary containers or volumes.

Browser review uses `review-native@example.test` / `Local-fixture-only-123456!`, seeded by `native-services-reviewer.mjs`. It is a fictional local login, not Curtis's account. Screenshots are outside Git in `outputs/arize-native-features-2026-11-22/clarity-local-services-phone.jpg` and `village-local-services-phone.jpg` under the workspace. Reloading signs out by design because browser review does not persist tokens.

## Remaining Phase 7 work — do not mark these complete

1. **Install/open Xcode 26+ and an iOS Simulator runtime.** The user must accept Apple's license/component prompts. Run preflight, build the default bundled app unsigned, fix actual Swift/SPM/bridge errors if any, then run a simulator. Requirements: [Capacitor iOS environment](https://capacitorjs.com/docs/ios).
2. **Prepare and validate a native-only test connection.** The current loopback review flag is deliberately browser-only and rejected on iOS. Do not weaken release ATS/CSP/origin guards or point the test build at production. Any simulator-only transport exception must be debug/target-gated and separately verified before a connected native test is claimed.
3. **Execute the iPhone matrix:** Keychain lock/unlock/reinstall, session restore/revocation/account switch, privacy cover/background, real custom-link routing, keyboard/safe areas, large text/VoiceOver, offline/reconnect, local reminder allow/deny/change/cancel/lock-screen/time-zone behavior. Physical-device testing needs existing client-owned development signing; new provisioning/account actions require separate approval. No TestFlight/App Store upload.
4. **Real notification delivery is still pending.** Browser permissions, supported push-provider delivery, iPhone Home Screen installation and scheduler capacity/load tests still need verification. No scheduler or sending configuration was activated. Native on-device reminders are not remote APNs; APNs remains separate follow-up work.
5. **Release review remains:** final bundle identity, icon/splash/name, privacy manifest/labels and policy disclosures, native sign-in choices, Village report/block/moderation/abuse controls, real adult provider configuration and reviewer notes. Text-only Village is not automatically store-ready. The existing dummy launcher/splash artwork and `Arize Foundation` development label have not been approved as final branding.

All future hosted migration/rollout/deployment/signing/upload actions remain outside this authorization. Completing local acceptance does not authorize production activation or permit any Student change.
