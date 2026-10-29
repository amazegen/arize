# Student staff workspaces — October 29, 2026

## Implemented boundary

The student edition has two distinct operator-assigned roles, scoped to one school per account. No existing student or legacy notification administrator is automatically upgraded. Auth identity, active role and school scope are checked server-side on each request and again inside database functions. Profile metadata and URL parameters cannot grant a role. Real staff assignment remains on hold pending verified school and login details.

- **Therapist/counselor:** sees only student-initiated requests: preferred name, request reference, timestamp, provider acceptance state, and operational follow-up stage. Can save new/acknowledged/contacted/closed with an immutable database audit. Can change the school's notification destination with the existing confirmation/audit workflow. Does not receive student user IDs, email destinations in request rows, private chat, goals, emotional scores, diagnoses or clinical notes.
- **School partner:** sees only approved, published school-level adoption reports and classroom resources. No roster, request inbox, counselor destination, individual wellness activity, student exports, demographic filters or risk flags.
- **Legacy notification administrator:** retains only the narrow existing destination-setting permission, unless separately assigned a new role. An explicit school-staff role blocks legacy notification permission to avoid accidental privilege stacking.

No clinical record/treatment workflow, automatic student monitoring or attendance linkage is introduced. Staff use established school contact procedures; a preferred name/reference may require an approved identity-resolution process before real operation. The app does not infer that an absence of requests means a student is safe. Email acceptance is not proof that a counselor read the message.

## Reporting safeguards

Publication is a privileged database operation, not a staff browser action. A separate operator-set school approval/review reference is required. No real approval is inserted by the migration. Only completed UTC calendar months can be published. The first published snapshot is frozen; rerunning publication cannot update it. No daily/grade/demographic query controls are exposed.

Reports contain ranges for the approved cohort and distinct participants using check-ins, goals, and Clarity—not scores, content, sentiment or attendance. Cohort = currently active, consent-verified memberships created before period end at publication time; these are adoption measures, not an historical attendance roster. Under 20 cohort members suppresses all values. Activity counts below 10 OR with fewer than 10 nonparticipants are withheld; otherwise counts are banded in tens. These are conservative product safeguards, not a statutory safe harbor or guarantee of anonymity. Multiple-month disclosures and outside school knowledge still require review. A small pilot may correctly receive no numeric report.

The report publisher currently has no scheduler or user-facing publish control: an operator must review the school approval and invoke it for a completed month. Do not claim reporting has been activated or that real metrics are already populated.

## Legal basis and limits of this implementation

DCPS/DC was the planning context, but the actual pilot school and jurisdiction are not confirmed. This is an engineering design, not legal advice or compliance certification.

- [US Department of Education: de-identified education records](https://studentprivacy.ed.gov/faq/what-constitutes-de-identified-records-and-information): removing direct identifiers is insufficient if combinations of information could reasonably identify a student. This supports restricted views, suppression, bands and disclosure review.
- [HHS/DOE FERPA–HIPAA guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/ferpa-hipaa/index.html): school-held records and independent healthcare-provider records can fall under different regimes. The real provider/school relationship must be established before deciding which rules apply; a therapist role alone does not establish HIPAA compliance.
- [DC student online data operator obligations, §38-831.02](https://code.dccouncil.gov/us/dc/council/code/sections/38-831.02): relevant school-purpose limitations, security, LEA control, advertising/sale restrictions and deletion duties need to be reflected in school/vendor agreements and operations.
- [DC Mental Health Information Act](https://code.dccouncil.gov/us/dc/council/code/titles/7/chapters/12/index.full.html): additional confidentiality/disclosure requirements may apply to mental-health information. Do not expand to clinical notes or treatment histories without review.
- [FTC educational technology policy](https://www.ftc.gov/news-events/news/press-releases/2022/05/ftc-crack-down-companies-illegally-surveil-children-learning-online): school use is not blanket permission for surveillance/commercial uses. Under-13 handling and the authorized consent basis remain launch-review items.
- [Supabase HIPAA projects](https://supabase.com/docs/guides/platform/hipaa-projects): a Pro subscription or micro compute alone does not establish a HIPAA-ready deployment. Applicable PHI use requires provider-contract/BAA/add-on and configuration review across the full stack, including hosting, email and AI—not only the database. No such paid add-on or compliance claim is created here.

## Before real-school activation

1. Verify school, therapist/staff identity, school scope, authorized contact channel and consent/disclosure basis.
2. Finalize school/vendor agreement, least-privilege access, retention/deletion policy, breach/incident process, and the human escalation/contact process. Determine records ownership and FERPA/HIPAA/DC applicability with qualified review.
3. Review student/parent notices and school-approved reporting purpose/audience. Record approval only after disclosure-risk review. Never treat a threshold as approval.
4. Provision approved accounts only; test revocation and cross-school denial. Do not enable notifications or AI for real students merely because the dashboard deploys.
5. Approve an operational retention period for request/audit records and implement scheduled deletion before broad production use; this patch does not introduce an automatic retention job.

## Verification

49 unit tests pass, including DTO field whitelisting, school/therapist response separation, unapproved-report withholding and stage validation. The disposable PostgreSQL integration suite applies the real migrations, exercises RLS/RPC guards, request projection, audited follow-up, destination updates, school-role denial, approval/publishing denial, small-group/complement suppression and role revocation, and rolls everything back. These tests do not substitute for a real-school agreement or production access acceptance.

The isolated hosted migration was approved and applied October 29. All five new tables have RLS enabled; post-checks found zero real staff assignments and zero reporting approvals. The opt-in hosted acceptance build `dpl_89L346RcKzjbJ9Re1MGBboBhZso6` passed actual authenticated HTTP dashboard reads, persisted follow-up PATCH, therapist-to-school role change separation, unapproved reporting withholding, and already-issued-session revocation. All synthetic accounts, requests and school fixtures were cleaned up. No real student email was sent.

The normal production build, without the synthetic-check flag, is READY: `dpl_BdPA7X8fSz692KjPD3mJVGvUTRY2`, app commit `6eca94d`, stable student URL `https://arize-student-arize-team.vercel.app`. Existing service gates and Vercel protection remain unchanged. Live entry is `/student/admin`; it requires an explicitly assigned staff account. Local-only review routes are `/student-design?screen=staff-therapist` and `/student-design?screen=staff-school`. They contain synthetic data and return 404 outside development.
