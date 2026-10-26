# Arize Student Edition implementation and launch checklist

The first Student Edition is a separate browser-based pilot for grades 9–12, based on the existing Arize product. Work is isolated on `codex/student-edition-phase-2`; the adult app, billing launch, production database, and main branch are not changed by this implementation.

## Scope from More Life OS

Source: [Arize project workspace](https://more-life-os.vercel.app/admin/projects/e381bf1b-6952-4a8b-95ba-5ff49da29f68/workspace). The “Arize Student Edition — First Version” milestone is due November 1, 2026.

- Student-focused onboarding for high school grades 9–12.
- Clarity guidance focused on school, tests, friendships, identity, sleep, family responsibilities, and college/career concerns.
- The original OS scope described a counselor button using the school's existing contact process. The October 26 clarification changes it to a student-initiated email request to Shelby, with a truthful sent confirmation. Merely viewing a screen or sending a Clarity message must not trigger a notification.
- AI disclosure, trusted-adult guidance, and emergency resources. No claim of live monitoring or automated crisis escalation.
- Chromebook browser usability testing and documented pilot setup.
- A pilot for up to 20 students and 10 teachers. The current user request restricts this edition to students; teachers must not receive student accounts or individual activity access. Confirm whether teachers are facilitators or need separate staff-only test tooling.

The adult Core/Plus billing launch is a different milestone. The AI configuration console, founder overview, marketing website, notifications, and App Store release are not part of this student implementation slice. No Student Edition purchases, wearables, model fine-tuning, school surveillance dashboard, or sharing of raw chats with teachers are added.

## Mockups and feedback

Jadon Kendrick's “Arize High Fidelity Mockups w/changes” submission was published October 25. Curtis's October 26 feedback favors the lighter tones and orange/green combination. The design task also calls for sunrise yellow, a cartoon lion concept, “Talk to your counselor,” and removing Reflect's redundancy with Clarity.

References are in the workspace Deliverables sheet:

- “01 — Home · Phone.png”: cream background, orange check-in action, yellow Clarity/Goals cards, green counselor handoff.
- “02 — Loading state · Phone.png”: loading placeholders, counselor access remains visible.
- “03 — First time, no check-in · Phone.png”: welcome and first-check-in empty state.
- “Chromebook.png”: persistent left sidebar and a wider two-column home arrangement.
- “arize logo png.png”: supplied brand asset reference. Student screens now use the existing main app's real flower asset (`public/flower nobg.png`), not a sunflower emoji. The lion concept placeholder was removed after the October 26 review; no new mascot or replacement logo is approved.

All four screen mockups were visually reviewed. The phone home reference was downloaded locally; the remaining references stay in More Life OS rather than being made public in this repository. The mockups show Village, but adult community access is deliberately omitted until a student-only community and moderation scope is agreed. No adult rooms are reused.

## Implemented in this branch

- Dedicated `/student` entry point, student sign-in, light theme, responsive sidebar/bottom navigation, back navigation, and accessible zoom.
- Invitation-only server authorization using administrator-managed enrollment, active status, and verified consent. A student's selected grade or editable auth metadata cannot grant access.
- Student profile with preferred name, grade, versioned pilot notice acknowledgement, and links to the existing policy documents. A student checkbox does not replace school/guardian consent.
- Daily 1–10 check-ins with descriptive feeling labels, goals with previous-day navigation, and completed goals rendered in a muted style with a checkmark. Adding a goal inserts a new row without resetting existing completion.
- Counselor request button and confirmation UI, private recipient configuration, school-scoped sending, a request ledger with ownership policies, duplicate-request protection, and a cooldown. The backend reports sent only after the email provider accepts the request. The request email contains only the student's preferred name, a request to connect, and a technical request reference—not chats, goals, scores, or student email. Live delivery is disabled until the student backend, verified sender, email-service credentials, and school approval are connected. Preview clicks never send email.
- Separate student profiles, check-ins, goals, conversations, messages, enrollment, schools, and durable AI usage counters. No adult chat or wellness tables are queried.
- Student Clarity prompt, input/output moderation, saved student conversation history, and quota foundation (5 turns/minute, 30/day, UTC database day). High-risk inputs route to a supportive safety response rather than ordinary coaching. Blocked raw input is not saved in app history.
- Student AI remains disabled by default. Missing model, credentials, safety classification, migration, or enrollment fails closed.
- Student deployment routing blocks adult Village, adult coach, checkout, billing portal, and other adult pages. An adult deployment does not expose student routes.
- Development-only sample-data design preview; it is inaccessible in production builds and never bypasses real student authorization.
- Visible Desktop, Phone, and Chromebook preview controls with Home, Goals, Clarity, Counselor, and Profile screen selectors. Embedded phone navigation stays in the phone frame.

## Existing app features to preserve

Student-appropriate functionality should be carried forward, not replaced with a smaller unrelated app. The theme, school-focused language, minor-safety controls, and data isolation change; adult data is not copied into student accounts.

| Area | Existing main app | Current student status and remaining work |
| --- | --- | --- |
| Goals | Week/day navigation, weekly goal planning/editing, categories, deadlines, notes, completion counts, goal-coaching shortcut, pattern map | Basic daily creation/completion and earlier-day navigation are implemented. Weekly planning/editing, categories, deadlines, notes, summaries, coaching shortcut, and the pattern view still need to be ported. Adapt Career wording for school rather than remove the capability. Friday Reflection is only a coming-soon screen in the current main app, not an existing working feature. |
| Clarity | New chat, saved history, starter prompts, recent mood context, keyboard send, streamed replies, retry/error handling | New chat/history and the protected school-coach API exist, but live AI is disabled. Starter prompts, recent mood context, keyboard behavior, and UX parity remain to be verified/ported. Student output moderation may require buffering before showing a reply. No adult chat history is shared. |
| Profile and Settings | Display name, username/validation, feedback, privacy policy, terms, sign-out, adult membership access | Preferred name/grade, notice, policy links and sign-out are implemented. Student username and feedback/settings parity still need to be ported. Adult subscription controls are intentionally omitted from the no-purchase student pilot. |

## Local review

```sh
npm ci --ignore-scripts
ARIZE_EDITION=student npm run dev -- --hostname 127.0.0.1 --port 3118
```

No production credentials are required to review these synthetic design fixtures:

- `http://127.0.0.1:3118/student-design`
- `http://127.0.0.1:3118/student-design?state=first-use`
- `http://127.0.0.1:3118/student-design?state=loading`
- `http://127.0.0.1:3118/student-design?state=onboarding`
- `http://127.0.0.1:3118/student-design?device=phone`
- `http://127.0.0.1:3118/student-design?device=chromebook`

These are local design fixtures, not a hosted pilot or evidence that live sign-in/AI works.

## Required before students are invited

1. Create/select a separate student hosting project/URL and dedicated student backend. Do not copy adult production credentials or point the student app at adult production data. No new paid service is provisioned by this branch.
2. Apply `20261026154409_student_edition_pilot.sql` to that student backend only. Configure `ARIZE_EDITION=student`, public student backend settings, and the correct auth callback/redirect allowlist. Keep billing disabled and Stripe credentials absent.
3. Confirm the roster, age eligibility, staff facilitator role, and school/guardian consent process with AmazeGen. Only an administrator can insert/activate enrollment and set `consent_verified_at`. No real students have been provisioned here.
4. Confirm Shelby's private notification destination (received from Jaivien October 26), configure a verified sender and transactional-email service, set `STUDENT_COUNSELOR_SCHOOL_ID` to the approved pilot school, and apply the counselor-request migration to the student backend. Complete a controlled delivery test and school approval before enabling `STUDENT_COUNSELOR_NOTIFICATIONS_ENABLED`. Verify sent vs failed/pending UI states and response-time expectations. No automatic crisis escalation or teacher monitoring is implemented.
5. AmazeGen must approve student-specific policy disclosures, data retention/deletion periods, provider processing, incident response ownership, school agreements, and consent language with its qualified advisors. Existing public policy links do not by themselves establish student-pilot readiness.
6. Review the provider's under-18 safeguards, account retention settings, current flagship model suitability, content filters, escalation/reporting process, and safety evaluation results. Configure the selected `STUDENT_COACH_MODEL` and scoped server credentials only in the student environment. `store: false` is not a zero-data-retention agreement. Do not enable `STUDENT_AI_ENABLED` until this review passes.
7. Run end-to-end tests with synthetic enrolled/non-enrolled/revoked accounts on the actual student backend: sign-in, acknowledgement, saving/reloading profile/check-ins/goals, history ownership, quota concurrency, counselor links, session expiry, provider/moderation failures, and high-risk school scenarios. Review blocked-input handling and classification false positives.
8. Test on a real school-managed Chromebook (including network restrictions), mobile browser, keyboard-only navigation, screen reader, zoom, reduced motion, narrow screens, slow/offline connections, loading/error states, and pilot concurrency. A desktop Chrome layout preview is not a completed Chromebook acceptance test.
9. Complete the feature-parity checklist above and obtain UX/client approval for remaining screens. Confirm the omission of adult Village and any remaining loading/empty-state refinements with Jadon/Curtis. Complete pilot sign-off before release.
10. Review and patch the pre-existing dependency advisories before release. The October 26 `npm audit --omit=dev` flags 5 production dependency groups (4 high, 1 critical): Next.js 16.2.11, sharp 0.35.3, nanoid, source-map-js, and zod. Assess applicability, upgrade on a tested branch, and rerun the audit/regression suite. This audit is not evidence of a deployed exploit or breach. No dependency versions or production deployments were changed in this initial slice.

Official references: [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [OpenAI under-18 guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance), [OpenAI moderation](https://developers.openai.com/api/docs/guides/moderation), and [API data controls](https://developers.openai.com/api/docs/guides/your-data).

## Verification

- TypeScript and existing/new unit tests are part of `npm run typecheck` and `npm test`.
- October 26 result: 28 tests pass, TypeScript and production compilation pass, and local PostgreSQL RLS assertions pass, including counselor-request isolation, idempotency, cooldowns, and denial of self-marking a notification as sent. Provider tests use a fake sender; no real email is sent.
- `npm run lint` has existing warnings in adult screens; new student files should remain warning-free.
- Production build uses placeholder public backend settings for compilation only; it does not validate live authentication.
- `tests/student-rls.sql` runs the actual migration and adversarial data-access assertions in a disposable local PostgreSQL database. It tests row ownership, denial of self-enrollment/forged identities, denial of forged assistant replies, revoked access, anonymous access, and preserving completed goals when adding one. It rolls back all fixtures.
- Live student backend, live AI, counselor process, school consent, and the full 20-student/10-teacher pilot acceptance remain unverified until the setup steps above are completed.
- Desktop and phone previews were visually reviewed, including the real flower logo and the explicit no-email-sent counselor preview. A development manifest/cache error was resolved by separating the preview build directory from production builds. Real-device and full pilot acceptance remain open.
- Production-mode localhost checks: `/student-design`, `/api/coach`, and `/api/billing/checkout` return 404; an unauthenticated `/api/student` call returns 401. Development with absent backend settings returns the explicit setup error rather than granting access.

No More Life OS completion statuses, client notifications, production settings, or real student records were changed by this work.
