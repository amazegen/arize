# Phase 4 — adult redesign review

Date: 2026-11-22. Branch: `codex/phase-4-adult-redesign`.

## Release note

The adult app now uses Jadon’s cream/orange/green/yellow direction, responsive sidebar/phone navigation, Nunito typography and local Figma icon/sunrise assets. Home is rebuilt around the check-in and shortcut cards. Profile uses identity and grouped navigation, with the original editable account fields, membership, privacy, feedback and deletion controls still available. Goals, Pattern Map, Clarity/history, Village, auth, onboarding and consent share the light palette.

Chat composers reserve space for phone navigation instead of introducing a stray page scroll. A resumed Clarity conversation no longer shows first-chat prompt suggestions. Village now cleans up its Realtime subscription on exit, rejects late initialization after unmount, and deduplicates received message IDs. This fixes the duplicate-subscription exception discovered during browser review. The cleanup follows [Supabase’s removeChannel guidance](https://supabase.com/docs/reference/javascript/removechannel); no subscription permissions or database policies changed.

No merge, deployment, live database access, schema migration, new credentials, Stripe configuration change, provider checkout or live AI request was performed. No Student source/workspace change was made. Stripe remains test/sandbox; local checkout and enforcement were explicitly disabled. Existing production subscriptions are untouched.

## Screen inventory

Here **BUILT** means the adult redesign/adaptation is implemented and locally reviewed, not that a new live-provider acceptance test was performed.

| Screen / route | Status | What is included / what remains |
| --- | --- | --- |
| Shared header/navigation/loading | BUILT | Flower logo, profile initial, six retained destinations, desktop sidebar, phone safe-area navigation, focus styles, skip link and loading skeleton. |
| Home `/home` | BUILT | Figma hero/check-in/shortcut layout, real existing greeting and activity queries, Village CTA and goal/pattern links. Final lion is tracked separately below. |
| Goals `/goals` | BUILT | Light calendar/cards, previous-week/day navigation, complete-state styling and accessible toggle labels. Existing goal rules retained. |
| Goal session `/goals/session` | BUILT | Existing goal editor, quota handling and completion-preserving workflow in the new theme. |
| Pattern Map `/goals/patterns` | BUILT | Existing chart/filter/history behavior retained, readable chart colors and light surfaces. No new metrics invented. |
| Clarity `/coach`, including history | BUILT | Light chat, correctly positioned composer, saved-chat picker, new/resumed conversations, first-chat suggestions only on new chats. Existing API and locked safety code unchanged. |
| Village `/village` | BUILT | Adult rooms/cards, readable entry controls and retained Core/Plus room restrictions. |
| Village room `/village/[roomId]` | BUILT | Themed conversation/composer, voice/video labels, safe wrapping of long messages, cleaned-up live subscription lifecycle. Real upload/realtime delivery still needs provider acceptance outside the fictional fixture. |
| Profile `/settings` | BUILT | Identity, reflections/pattern links, account/membership/help navigation, original profile fields, legal/feedback links, sign-out and deletion controls. No fake preferences or Student grade/school fields. |
| Plans `/upgrade` | BUILT | Light Core/Plus cards and existing billing actions. Configured $1.99/month and $19.99/year, trials and usage caps retained; no placeholder Figma prices or unlimited AI claims. Provider billing acceptance remains Phase 2 work. |
| Sign-in `/sign-in` | BUILT | Shared responsive auth frame, email/password labels, show/hide label, Google and email flows retained. |
| Sign-up `/sign-up` | BUILT | Shared auth frame, first-name/email/password labels and existing signup flow retained. No real signup was submitted. |
| Onboarding `/onboarding` | BUILT | Existing adult steps/profile setup restyled. Removed absolute “data never leaves your account” wording; no new focus/preference storage added. |
| Consent `/consent` | BUILT | Existing age/terms/privacy gate restyled; unchecked/disabled controls remain legible. Nothing was accepted in testing. |
| Feedback `/feedback` | PARTIAL | Existing “survey coming soon” fallback is restyled. Configure the approved feedback URL to use a real survey; survey creation is not part of this redesign. |
| Reflect `/reset`, `/reset/history`, `/reset/complete` | PARTIAL | Explicitly held unchanged, including the existing dark screen content. Shared shell is new. No Reflect source edits. |
| Friday Reflection `/goals/friday-reflection` | PARTIAL | Existing stub retained by request; not represented as finished functionality. |
| Final lion illustration | BLOCKED | Jadon’s final approved artwork is missing; provided sunrise-ring assets are used in the meantime. |
| AI configuration `/admin/clarity` | BUILT | Existing Phase 3 light console retained, not rebuilt. Its settings/safety/versioning logic is unchanged. |

Marketing, Founder analytics, push and iOS remain later phases, not hidden additions to Phase 4.

## Verification results

| Check | Result |
| --- | --- |
| Adult `npm run typecheck` | PASS |
| Adult `npm run lint` | PASS, zero errors; one pre-existing `<img>` warning in the unchanged marketing home `app/page.tsx:50`. |
| Adult `npm test` | PASS — 67/67, including 7 redesign checks plus existing billing, consent and AI safety tests. |
| Adult `next build --webpack` | PASS — local optimized production build; no Vercel build. Initial restricted-network font fetch failed, then passed with public-font network access. |
| Student `npm run typecheck` | PASS, separate unchanged Student checkout. |
| Student `npm test` | PASS — 99/99. |
| Student `ARIZE_EDITION=student next build --webpack` | PASS, separate unchanged Student checkout at `a2a77f1`. |
| Student Git status | Clean before/after regression checks. |
| Adult backend / safety / schema / Reflect diff | No changes in `app/api`, `lib`, `supabase`, Reflect routes or Friday Reflection source. |
| Figma assets | 11/11 local nonempty SVGs; native geometry checked, no scripts/external references; all rendered Home/navigation assets loaded at intended dimensions. |
| Principal text/action contrast | Automated AA checks pass for ink/cream, ink/orange, ink/yellow-soft, muted/cream/white/yellow-soft, green/green-soft, error/error-soft. This is not a full accessibility certification. |

### Browser review with synthetic data

Reviewed the local optimized build at **375×812**, **768×1024** and **1280×900**. All 12 routes below rendered with **no horizontal overflow**, application-error page or broken image (36 route/viewport checks):

`/home`, `/goals`, `/goals/session`, `/goals/patterns`, `/coach`, `/village`, the fictional Village room, `/settings`, `/upgrade`, `/feedback`, `/reset`, `/reset/history`.

Also checked sign-in, sign-up, the first onboarding screen and consent at those widths. Confirmed the 232px sidebar at desktop and bottom navigation at phone/tablet sizes. Confirmed previous-week goals/empty-day display, opening a saved Clarity conversation, new-chat draft controls, password labels, fictional sign-in failure/success, sign-out and repeated Village entry/exit without the old duplicate-subscription exception. At 375px, chat page height equals the 812px viewport and the composer ends exactly where bottom navigation starts.

Snapshots and DOM measurement results are local review artifacts under `outputs/arize-phase4-2026-11-22/` in the More Life Consulting workspace, not application assets. They contain only fictional data.

### Limits of this verification

The layout fixture is **not** a real Supabase, RLS, realtime, upload, OpenAI, Stripe or email test. Profile/goal persistence, paid billing, account deletion and AI generation were not executed against a real service. Existing backend tests still pass; provider acceptance from earlier phases is not silently marked complete here. The local `127.0.0.1` Next server can return 403 for the pre-existing billing access-refresh origin check because Next supplies an internal `localhost` request URL; the last server-rendered access view stays visible. That billing handler is unchanged and needs confirmation at the approved canonical sandbox URL in Phase 2. No security check was relaxed to make the fixture pass.

## How to review locally

Use a clean terminal without production secrets. The existing fixture must be started explicitly; its account is fictional and is not valid on any real app:

```sh
node tests/fixtures/adult-layout-backend.mjs --synthetic-only
```

In another terminal, build and run with the following fictional configuration (use the same variables for both commands):

```sh
env ARIZE_EDITION=adult NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3148 NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-layout-anon STRIPE_EXPECTED_MODE=test BILLING_ENFORCEMENT_ENABLED=false STRIPE_CHECKOUT_ENABLED=false NEXT_PUBLIC_BILLING_CHECKOUT_ENABLED=false npm run build -- --webpack

env ARIZE_EDITION=adult NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3148 NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-layout-anon STRIPE_EXPECTED_MODE=test BILLING_ENFORCEMENT_ENABLED=false STRIPE_CHECKOUT_ENABLED=false NEXT_PUBLIC_BILLING_CHECKOUT_ENABLED=false npm start -- --hostname 127.0.0.1 --port 3149
```

1. Open `http://127.0.0.1:3149/sign-in`; use `layout@example.test` / `layout-fixture-only`.
2. Inspect Home and every nav destination at phone, tablet and desktop widths. Reflect intentionally retains its original content styling.
3. In Goals choose a previous week/day; return to this week. Confirm the goal editor remains available.
4. In Clarity open **History**, select the fictional saved chat, then **New chat**. Type a draft and check the composer. Do not use this fixture to assess AI answers or persistence.
5. In Profile try the section links, inspect membership, legal and deletion controls. Do not submit deletion or checkout during a visual review.
6. Enter/exit the Village room twice, confirm long text wraps and the composer remains above navigation. Do not grant microphone/camera permission or upload media for a layout test.
7. To inspect consent without agreeing, restart only the fixture with `--synthetic-only --without-consent` and open `/consent`. Restore the default fixture afterward. Nothing is saved.

## Review dependency and release safety

This is an adult-only stacked PR based on `codex/phase-3-clarity-adult` (`3a47282`), the local adult counterpart of Phase 3, which itself depends on adult billing PR #2 (`bb8829c`). Student Phase 3 PR #4 is on a different branch lineage; **do not merge it into the adult branch to resolve this dependency**. Review Phase 4’s diff against the adult Phase 3 base, and reconcile prior phases separately before any authorized main merge.

`vercel.json` explicitly disables Git deployments for the Phase 4 branch and the prior review branches. No `main` push, preview deployment, production deployment, provider setting, build-machine change or live database operation is part of this PR.

Read-only Vercel Git-context inspection also confirms that Arize Team’s adult project is currently linked to `amazegen/arize2.0`, not this `amazegen/arize` repository, and the Student project has no listed Git link. No connection was changed. The release owner must reconcile the intended repository/project path before a future authorized deployment; this PR must not silently repoint either app.

Rollback is code-only: before release, discard this review branch; after an explicitly approved future integration, revert the Phase 4 commit through normal review. There is no database or secret rollback. Keep the approved deploy path and one-batch policy when a future deployment is requested.
