# Arize

Arize by AmazeGen is a private workplace-wellness application designed for Black professionals navigating corporate environments. It combines mood check-ins, weekly goals, reflective exercises, community rooms, and an AI coaching experience called Clarity.

## Stack

- Next.js 16 and React 19
- Supabase Auth, Postgres, Row Level Security, Realtime, and Storage
- OpenAI API
- Tailwind CSS

## Local setup

Requirements:

- Node.js 20.9 or newer
- A Supabase project
- An OpenAI API key

Install dependencies and create your local environment file:

```bash
npm ci
cp .env.example .env.local
```

Populate `.env.local`, then initialize the database:

1. For a new Supabase project, run `supabase/schema.sql` followed by `supabase/schema-updates.sql` in the SQL editor.
2. For an existing Arize database, run only `supabase/schema-updates.sql`.
3. Add your local and deployed `/auth/callback` URLs to the Supabase Auth redirect allow list.

Start the application:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server | Supabase publishable/legacy anon key |
| `OPENAI_API_KEY` | Server only | OpenAI API authentication |

Never expose the OpenAI key or a Supabase service-role key through a `NEXT_PUBLIC_` variable.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Run all checks together with `npm run check`.

## Application structure

- `app/(auth)` — sign-in and sign-up
- `app/(app)` — authenticated product routes
- `app/api/coach` — authenticated, validated, rate-limited Clarity streaming endpoint
- `lib/supabase` — browser and server Supabase clients
- `supabase/schema.sql` — complete schema for new projects
- `supabase/schema-updates.sql` — idempotent upgrade for existing projects
- `tests` — security and request-validation tests

## Security notes

Phase 7 browser-reminder and unsigned iOS-foundation setup, tests and remaining
release gates are in [docs/phase-7-push-ios.md](docs/phase-7-push-ios.md).
The native starter is a separate local bundle under `apps/mobile`, not a remote
website wrapper or a finished App Store release. Notification delivery is off by default.

- Product tables use Row Level Security.
- Coach requests are limited atomically in Postgres to 10 per minute and 100 per day for each user.
- Village media uploads are limited to authenticated users’ own storage prefixes.
- Village audio and video are currently stored in a public bucket so room clients can play their URLs. Do not use this bucket for highly sensitive media without migrating it to private storage and signed URLs.
