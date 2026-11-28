# Phase 7 — local iOS compilation and startup, November 23, 2026

Adult-only continuation on `codex/phase-7-native-features`, stacked draft PR #9. Nothing merged, deployed, provisioned or uploaded. No Apple account/certificate or physical-device/store signing. No hosted database, Stripe, OpenAI or Student operation. This supplements the [November 22 receipt](phase-7-acceptance-2026-11-22.md); it does **not** certify Phase 7 or App Store readiness.

**Follow-up qualification:** the original compile checks below were unsigned. Connected Keychain testing subsequently required Xcode's **local ad-hoc simulator identity**, described at the end of this receipt. No Apple account, signing certificate, real team, provisioning profile or device/store signing was used.

## What changed

- Added an explicit connected **Debug iOS Simulator** fixture. JavaScript must request it, and the native bridge independently requires `DEBUG && targetEnvironment(simulator) && ARIZE_SIMULATOR_TEST`. Release and physical-device builds return false. Local origins are fixed to `http://127.0.0.1:56581` (disposable Supabase) and `http://127.0.0.1:3190` (adult gateway); LAN, hosted, Student and alternate-port targets are refused by this fixture.
- The helper uses the existing unlinked, loopback-only fictional backend guard. Its temporary plist allows HTTP for **127.0.0.1 only**, without arbitrary loads or subdomains. The normal tracked app plist is unchanged. Google login remains disabled in this fixture.
- Fixed the helper's temporary plist filename: Xcode reserves `DerivedData/Info.plist` for workspace metadata. Using that name originally produced a compiled but un-installable fixture without a bundle ID. `SimulatorFixture-Info.plist` avoids the collision; the helper now verifies the final bundle ID and exact ATS exception after compilation.
- Disabled Capacitor bridge/JavaScript forwarding logs (`loggingBehavior: 'none'`) so secure plugin arguments and results are not serialized to debug logs. App code still must not log private content.
- Pinned the resolved official Capacitor Swift package at version 8.6.2. No native dependency upgrade.

## Verification

| Check | Result and limits |
| --- | --- |
| Xcode | PASS: Xcode 27.2, build 27B52; iOS Simulator 27.2 SDK. Existing first-launch status was complete. No license accepted or global Xcode selection changed by this work. |
| Runtime | Installed Apple's arm64 iOS 27.2 runtime, build 24B8117. A second security-variant download was canceled after the first runtime was verified; existing runtimes/devices were not deleted. |
| Default Debug compile | PASS: unsigned `iphonesimulator` build, actual arm64/x86_64 executable produced. |
| Connected Debug compile | PASS: unsigned fixture build with exact loopback-only ATS and correct `com.amazegen.arize.dev` identity. The final helper's artifact postflight also passed. |
| Installation and startup | PASS: fixture installed on dedicated `Arize Local Test iPhone` (iPhone 17 simulator), launched successfully, and remained running when checked with `launchctl`. This is process startup, **not** a visual sign-in/Keychain acceptance test. |
| Release compile | PASS: unsigned Release simulator build with the normal offline bundle; correct bundle identity and **no NSAppTransportSecurity override**. Native compile conditions and automated tests guard fixture rejection. No runtime Release account test is claimed. |
| Adult regression | PASS: ESLint, typecheck, 99 Node tests and optimized local Webpack build with fictional local services. Existing enclosing-workspace lockfile warning remains. No production provider used. |
| Mobile regression | PASS: typecheck, 13 Node tests, default bundle and Capacitor sync. Tests include fixture positive/negative cases, native compile gate, helper restrictions and log suppression. |
| Student separation | Separate checkout remains clean at `a2a77f1381545264feca6cdca4ce4ecb552ffdde`. No Student files, credentials or services changed. |

Xcode emitted generic simulator-destination warnings but returned success and produced executable app bundles. A successful build is not evidence that every screen or native plugin works.

## Screen-control blocker and remaining checks

Apple's Device Hub opened and started the dedicated simulator. The desktop automation connection then failed with screen-capture/window errors and could not reliably read or control its screen. No alternative UI automation or fabricated screenshots were used. The following remain **unverified in native iOS**:

- Visible startup and sign-in; Keychain persistence across process restart, sign-out/account switch, lock/unlock and reinstall.
- Goals editing/history, saved Clarity continuation, text-only Village and real native keyboard/scroll behavior.
- Same-device callback routing, background privacy cover, offline/reconnect, large text and VoiceOver.
- Reminder permission allow/deny, changing/canceling reminders, notification interaction, Focus and time-zone behavior.
- Physical iPhone execution. Simulator compilation is not physical-device acceptance.

The actual local Auth/REST/Realtime/Mailpit/API suite and browser acceptance from November 22 remain useful lower-layer evidence, **not substitutes** for these native checks. Browser push delivery/scheduling, APNs, hosted provider acceptance, Village abuse controls, final branding, store disclosures and other release gates from that receipt are still pending.

## Reproduce locally

Use the existing disposable stack only while it remains available; do not substitute hosted credentials or link it to a project. The guarded backend and fictional reviewer are documented in the November 22 receipt.

```sh
# From the adult repository root; local services must already be running.
ARIZE_NATIVE_SERVICES=/private/tmp/arize-native-services.IlH5kn node tests/fixtures/native-services-simulator.mjs --synthetic-only
```

The helper prints a fresh temporary app path. Install/launch that artifact only on the dedicated local simulator. It does not provision, sign, archive or upload. The installed fixture inspected for this run is `/private/tmp/arize-ios-connected-simulator.R8DqMa/Build/Products/Debug-iphonesimulator/App.app`; paths are disposable, not release artifacts.

After fixture builds, restore the safe default local assets before any ordinary Xcode work:

```sh
cd apps/mobile
npm run build
npm run ios:sync
```

Normal account networking remains off by default. The simulator may retain its explicitly installed fictional-data fixture until replaced. No physical-device signing, Apple account action, real email delivery, production key copying or deployment is authorized by this receipt.

## Follow-up — visible startup and simulator Keychain identity

- Restored screen observations by raising the Device Hub window and switching to its compact iPhone view. Pointer input remains unreliable (`noWindowsAvailable`) and the app's WebKit fields are not exposed in the available accessibility tree. Mac menu controls and screenshots work; keyboard entry reached the fictional email field, but sign-in has **not** been verified.
- The earlier running process was actually stalled on “Restoring your secure account.” Added an explicit initial `refresh()` in `useAccounts`; startup no longer relies solely on an `INITIAL_SESSION` event that may never be emitted after a storage failure. The unsigned fixture then surfaced its real secure-storage refusal.
- Comparing the builds showed that the unsigned fixture lacked Xcode's simulated application identity. An Xcode build with `CODE_SIGN_IDENTITY=-`, `CODE_SIGNING_ALLOWED=YES` and an empty `DEVELOPMENT_TEAM` supplies `FAKETEAMID.com.amazegen.arize.dev` for the **simulator only**. It visibly reaches “Welcome back” without the secure-storage alert. This is not hardware Keychain acceptance.
- Updated the connected fixture helper to use that local identity. It still forces Debug and the simulator SDK, preserves exact loopback-only transport and verifies the final app signature is ad-hoc, has no team identifier, contains no provisioning profile and carries only the expected simulated app identifier. No Apple signing key is selected. The default offline `ios:check --build` path remains unsigned.
- The final helper rebuilt successfully at `/private/tmp/arize-ios-connected-simulator.ilyVnw`. The app currently installed for visible review is the Xcode local-identity build at `/private/tmp/arize-ios-xcode-local-identity.PTiDef/Build/Products/Debug-iphonesimulator/App.app`. It includes the explicit startup check; the final helper additionally defers that check to a cleanup-safe timer for React. It has not replaced the installed app during the user focus handoff. Both use fictional local services. A manually re-signed temporary copy did not launch; it was replaced by the actual Xcode-generated build, not retained as the tested path.
- Mobile typecheck and all 13 tests pass, including the local-identity helper guards and explicit startup-check regression. Connected UI sign-in, session persistence, Goals, Clarity, Village, notifications, accessibility and physical-iPhone acceptance remain pending. The original browser/API receipts are not substitutes for these tests.

To continue native UI testing, click the Email field in the compact `Arize Local Test iPhone` window. Use only the fictional reviewer credentials from the November 22 receipt. Do not use a production login or accept new legal terms as part of this fixture review.

## Retest after reducing other application load

- User confirmed the live Device Hub window accepted taps after restarting the dedicated simulator and Device Hub, but even Apple's Settings app was very slow. Its screen reported “Optimizing Search and Siri.” No simulator data was erased; no unrelated application was closed.
- After the user closed applications, installed the final `ilyVnw` fixture on the same test simulator and launched it successfully. Verified its process is running. Read Device Hub's keyboard options: Secure Keyboard Entry was already off, so no security setting was changed.
- Native screen-control calls still timed out. Accessibility Inspector launched, but its control call timed out; a subsequent attempt to reconnect to Device Hub also timed out. No alternate UI automation was used. The inspection app may still be open. This is a testing-environment blocker, not a passing native sign-in or feature test.
- Mobile typecheck and all 13 tests pass again.
- Reran the **actual isolated local-service acceptance suite** successfully: verified Auth/setup; Goals persistence/completion/RLS/Core cap; 205-message pagination; real ledger/quota/checked-history with mocked AI and crisis handling; two-account WebSocket text delivery/deduplication; TOTP/AAL gates; bounded membership-outage continuity; refresh/revocation/bans; local confirmation/PKCE/duplicate-signup handling; local recovery/password replacement; and deletion of the suite's own disposable account. No Stripe, hosted database, external AI or real-email operation.
- The first suite attempt exited during the local CLI status preflight, before creating test data. The diagnostic status check then reported the expected healthy, loopback-only stack; one retry passed the complete suite. No guard was bypassed, dependency upgraded or database reset performed.

Native UI acceptance remains pending. Save work and restart the Mac before another native-control attempt if timeouts persist; this has **not** been done automatically. Reconfirm the fictional backend services after a restart rather than substituting hosted credentials. Student, subscriptions and all release/deployment boundaries are unchanged.

## November 24 — post-restart native retest

- User restarted the Mac. Verified the new uptime and cleared swap. The reboot removed the temporary CLI configuration/artifacts but preserved the existing Docker data and the installed simulator app. Restored only the guarded temporary CLI configuration at `/private/tmp/arize-native-services.VBaUS5`; did not reset data, replay schema, start the stopped `unpublished-original` containers or link a hosted project. Confirmed the surviving local installation is `adult` and published service ports remain bound to `127.0.0.1`.
- Restarted the fictional-only AI stub on `127.0.0.1:3191` and adult gateway on `127.0.0.1:3190`. External AI, Stripe, email and hosted database calls remain prohibited by the local test network guard.
- **Native sign-in PASS:** the installed local-identity fixture accepted the preconsented fictional reviewer and visibly reached the adult Home screen, including “Good morning, Local,” and Home/Goals/Clarity/Village/Profile navigation. No real credentials or new legal acceptance were used.
- **Native process-restart session PASS:** terminated and relaunched `com.amazegen.arize.dev` on the dedicated test iPhone. After initial rendering, the same authenticated Home screen returned without re-entering credentials. This verifies this simulator's Keychain-backed session across process restart, not lock/unlock, reinstall or physical-device behavior.
- **Native Goals navigation/load PASS:** user clicked Goals and confirmed it opened. A subsequent native screenshot showed the loaded Goals screen, current week/day selector, zero-goal empty state, add-goal form and selected Goals navigation. This verifies screen navigation and initial data load, not creation/editing/completion/history interactions.
- Device Hub's direct pointer control remains intermittent: the next automated form-field click again failed with `noWindowsAvailable`, despite working screenshots and Mac menu controls. The user's successful click distinguishes this control-path failure from a generally unresponsive app. Goals mutations/history, Clarity, Village, sign-out, privacy cover, reminders and other native UI checks remain pending; they have not been promoted to passing from API tests alone.
- Mobile typecheck, all 13 mobile tests and all 99 adult Node tests pass again. The actual isolated local-service suite also completed all 11 PASS groups: accounts/setup/Core/Plus; Goals persistence/completion/RLS/cap; 205-message pagination; checked AI/history/quota/idempotent retry with mocked generation; two-account realtime text; TOTP/AAL; bounded membership-RPC outage continuity; refresh/revocation/bans; local confirmation/PKCE/duplicate signup; local recovery; and deletion of the suite's own disposable account. No hosted provider was used. These are not substitutes for the still-pending native UI checks.

No merge, deployment, hosted database operation, Student edit or Apple upload was performed.

## November 24 — browser continuation; iPhone matrix deferred

At the user's request, continued in the adult browser fixture instead of the slow simulator. Rebuilt through `native-services-mobile.mjs --synthetic-only` with the guarded existing local stack and served the static bundle at `http://127.0.0.1:3183/`. No iOS sync, hosted connection, schema change or deployment. Browser review sessions remain memory-only by design; these results do not replace iPhone Keychain/OS acceptance.

| Browser check | Observed result |
| --- | --- |
| Goals completion regression | PASS: created a fictional goal, completed it, created another, and observed 1 of 2 complete with the original still checked. Both persisted after explicit sign-out/sign-in. No deletion performed. |
| Previous-week navigation | PASS: moved from Nov 22 to Nov 15, saw that week's empty state, and returned using Next week. This does not verify a dated historical goal's contents. |
| Saved Clarity continuation | PASS: opened the existing long chat, sent a clearly fictional continuation, received the mock-provider answer, loaded earlier messages through message 1, then signed out/in and reopened the continued conversation. Latest-turn scroll position was at the bottom after reopening. No real OpenAI call. |
| Text-only Village | PASS: sent a fictional message in Local Review Room, refreshed, signed out/in, reopened the room and saw the saved text. Two-account realtime remains covered by the local-service suite, not this single-browser UI pass. |
| Profile and greeting | PASS: changed the fictional display name, observed the changed first name on Home, and restored the original fixture name. Afternoon greeting matched the test's local time. |
| Sign-out | PASS: returned to the sign-in screen with no authenticated navigation, then successfully signed back into the same fictional reviewer. |
| Phone-width layout | PASS for the inspected 390×844 browser state: document width 390, no horizontal overflow. This is Chromium, not iOS WebKit/keyboard/safe-area acceptance. |
| Console | No captured warnings/errors during this browser pass. |

Minor polish observation, **not fixed in this testing pass**: reopening Village briefly displays “No messages yet” while the initial fetch is pending, before persisted messages appear. A distinct initial loading state would avoid that misleading empty-state flash.

The subsequent Village fix below supersedes this observation.

Screenshots (outside Git): `outputs/arize-browser-qa-2026-11-24/{goals-phone,village-phone,clarity-phone}.jpg` in the enclosing More Life Consulting workspace. Local browser left open on the saved conversation; temporary viewport override reset. Only the local receipt was edited. Student, subscriptions and release boundaries remain unchanged. Remaining iPhone tests are deferred, not passed; Phase 7 remains incomplete.

## November 24 — Village loading fix and first-join acceptance

- Added explicit initial room-list and message loading/error states. The message empty state appears only after a successful fetch. A failed initial fetch offers Refresh instead of falsely reporting an empty room; failed background refreshes retain previously loaded messages.
- Added room-visit epochs and latest-request sequencing for message loads, so late or out-of-order initial/realtime fetches cannot overwrite the current visit. Room selection clears old pagination, draft text and retry state. Back-to-list navigation does not delete membership. Explicit Leave room still does.
- Existing server membership persistence was already implemented; no database or authorization change was needed. Verified a **first-time join** in fictional Local Acceptance 1a444e52, Back → Open room without a new Join prompt, and a full browser reload/new login → Open room → saved messages. The UI snapshot captured Loading messages during reopening. After reauthentication, Join room count was zero and Leave room count was one. This did not silently enroll the account in other rooms or override leaving.
- Regression coverage: actual server-rendered initial room-list loading test plus message-state/stale-request/back-navigation source guards (3 new tests; 16 total mobile tests). Mobile typecheck/default and connected browser builds, root lint/typecheck and adult 99-test regression were checked. No new dependency, schema, provider key or external service.
- Browser console recorded no warnings/errors. Proof: enclosing workspace `outputs/arize-browser-qa-2026-11-24/village-fixed-phone.jpg`. Browser preview rebuilt/reloaded and left open; no iOS sync or simulator rebuild. Changes remain local on `codex/phase-7-native-features`; no commit/push, merge or deployment.

### Remaining work besides the deferred iPhone matrix

1. **Browser notification delivery and operations:** controlled real-provider permission/deny/enable/disable/expiry tests, dedicated adult VAPID configuration/contact, scheduler cadence/capacity/load checks, monitoring and kill-switch owner. The queue/dispatcher is implemented, but real sending and a scheduler are not activated. Hosted setup requires separate approval; do not use Student credentials.
2. **Village abuse controls:** report/block/moderation workflows and message-abuse protection before a public native release. Text-only does not remove this release gate. Current local join/send/RLS/realtime checks do not certify hosted sustained load or long-offline catch-up.
3. **Adult service acceptance:** separately authorized test-target migration/configuration and real Auth/email/callback, adult AI quality/availability and hosted Realtime/reconnect checks. Local Auth/REST/WebSocket tests are completed; mock AI and local Mailpit are not real-provider acceptance. Google sign-in remains disabled/provider-untested; decide which sign-in methods ship.
4. **Release identity and handoff preparation:** approved bundle ID/callback destination, final app name/icon/splash, connected-app privacy manifest/labels/disclosures, support links, reviewer demo access and notes. Storefront billing/sign-in requirements need review before submission; no native purchases or live subscription activation is included here. These are release-readiness gates, not proof that the current first-slice scope included an Apple submission.

APNs remote push is separate follow-up scope if requested; existing native reminders are local notifications. Apple upload, real sending, hosted migrations, merging and deployments remain unauthorized. Student and Stripe stay untouched. Phase 7 is not declared complete from these browser checks.

## Village safety continuation

The reporting/blocking/moderation/message-spam code and local acceptance now supersede the unimplemented text-Village abuse-controls item above. See [Village safety receipt](village-safety-2026-11-24.md) for exact limits, tests, private-media protections, remaining operational/media-review gates and rollout boundaries. Nothing has been installed on a live backend or assigned to a real moderator.

## Browser push reliability continuation

See [browser push acceptance](browser-push-acceptance-2026-11-24.md): bounded multi-batch capacity, hard HTTPS deadline, account/session-bound management, aggregate monitoring, default-paused database sender, expiry/cleanup improvements and a dry-run scheduler runner are locally prepared and tested. A 1,000-fictional-device queue passed with simulated delivery; this is not real provider/device acceptance. Actual notification permission/delivery, scheduler installation and any hosted rollout remain pending separate approval. Student and Stripe remain untouched; no merge/deployment or live database operation.
