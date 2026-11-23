# Phase 7 — local iOS compilation and startup, November 23, 2026

Adult-only continuation on `codex/phase-7-native-features`, stacked draft PR #9. Nothing merged, deployed, provisioned, signed or uploaded. No hosted database, Stripe, OpenAI or Student operation. This supplements the [November 22 receipt](phase-7-acceptance-2026-11-22.md); it does **not** certify Phase 7 or App Store readiness.

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
