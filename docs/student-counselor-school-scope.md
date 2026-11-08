# Student counselor setup — 2026-11-08

## Release state

- User approved the Student Edition exception and access/updates to its isolated Supabase backend.
- Five existing pilot-school records are configured for `America/New_York`. No school data collection, reporting approval or student enrollment was activated.
- The approved counselor was invited through the existing branded password-setup flow. The account must still confirm the email and set its own password; no credential was created or changed on the counselor's behalf.
- The isolated Student backend now has a counselor-only primary staff role, five explicit school assignments, per-school notification destinations, and contact instructions in English and Spanish. Hours: daily 05:00–23:00 Eastern, about two hours to respond during those hours (an estimate, not a guaranteed emergency response); no backup contact configured.
- Migration `20261108214941_student_counselor_school_scope.sql` was applied atomically through the verified Student Supabase dashboard, then configuration and permission metadata were read back. Do not run this create-table migration again against that backend without checking migration history; prior Student changes also used manually reviewed SQL.
- This branch contains the **unreleased** school picker and request-scoped server/API changes. No Vercel deployment, Git push, merge, billing activation or subscription cancellation was performed. Existing deployed code continues to open the counselor's primary school. Switching among the five schools in the UI requires a separately authorized app release.

## Isolation design

The single primary membership remains backward compatible. The new assignment table grants no student role, project-admin role or school-report permission. Authenticated users can read only their own active counselor assignments and cannot assign themselves. The normal staff role and MFA-assurance checks remain required.

The `school` URL parameter is passed as a request-local `x-arize-school` header by the server Supabase client. It is not an authorization claim: the database accepts it only when that school is the active counselor's primary or explicitly assigned school. Invalid, unassigned and revoked schools fail closed. Non-counselor roles retain their original single-school scope. User metadata never grants access.

Dashboard reads, follow-up writes, notification reads/updates and navigation preserve that explicit school parameter. Two tabs cannot silently redirect an email-setting save into a different tab's selected school; there is no shared mutable school-context row or global server state. The page component key resets the inbox when changing schools, and unsaved follow-ups require confirmation before leaving.

Existing request/follow-up/email-setting RPCs and RLS use the scoped `staff_school` helper. Private student chats, goals and check-ins remain inaccessible to staff. A preferred name submitted voluntarily in a counselor request is not access to a private chat or clinical record. Contact requests remain student-initiated; no automated crisis surveillance or notification was added.

## Verification

- 89 Node unit tests pass, including whitelist coverage for the school-picker DTO.
- `npm run typecheck` and `npm run lint` pass (seven existing warnings in legacy adult screens; no new errors).
- Default build and `ARIZE_EDITION=student npm run build` pass locally. Live provider acceptance scripts stayed disabled; no production credentials were downloaded.
- Full disposable local Student SQL suite passes and rolls back. New assertions cover five-school selection, unassigned/invalid-school rejection, school-bound inboxes/follow-ups/email settings, no self-assignment, revoked scopes, MFA and private-record denial.
- Corrected an old test's fixed August report date to use the same relative month as its fixture; no application reporting behavior changed.
- Hosted readback verified five active counselor assignments, five matching Eastern-time contact configurations, zero active student enrollments, zero collection/reporting approvals, RLS enabled, no browser INSERT or anonymous SELECT on assignments, invoker scope RPC, and no project-admin role for the counselor.
- Refreshed the hosted Supabase Security Advisor: zero errors, 35 warnings and 12 informational suggestions. The displayed warnings concern existing public-schema SECURITY DEFINER functions (including `rls_auto_enable` and existing authenticated RPCs); this is not a clean security audit. Broader function-permission review remains separate from this counselor setup. No permissions were weakened to suppress warnings.

## Remaining acceptance

After an explicitly authorized Student app release, have the counselor finish the invitation, sign in, switch through all five schools, and verify the heading, inbox and notification destination correspond to each selected school. Do not use a real student request just to test delivery. Record actual school approval/consent scope before enrolling students or enabling collection/reporting. The adult/mainline billing PR is separate and its launch remains on hold.
