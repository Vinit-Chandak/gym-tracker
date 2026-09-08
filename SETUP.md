# Setup guide — the steps only you can do

Everything below happens outside the code: creating the Supabase project, your login user,
the Vercel project, and filling in environment variables. Do the steps in order; the whole
thing takes about 20 minutes. Nothing here needs the secret/service-role key.

## 1. Create the Supabase project (free plan)

1. Go to <https://supabase.com/dashboard> and sign in (GitHub login is fine).
2. **New project**.
   - Organization: your personal org (Free plan).
   - Name: `overload` (any name works).
   - Database password: click **Generate a password** and save it in your password manager.
     You need it in step 3.
   - Region: **Mumbai (ap-south-1)**, the closest region to India.
3. Wait until the project shows **Active** (one to two minutes).

## 2. Copy the two browser-safe keys

Left sidebar → **Project Settings** (gear) → **API Keys**.

| Dashboard value                                           | Goes into                       |
| --------------------------------------------------------- | ------------------------------- |
| Project URL (looks like `https://abcd1234.supabase.co`)   | `NEXT_PUBLIC_SUPABASE_URL`      |
| Publishable key (`sb_publishable_...`) or legacy anon key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

Do **not** copy the secret or service-role key anywhere in this project.

## 3. Copy the two database connection strings

Top bar → **Connect** → choose the plain URI view.

| Connection type                   | Goes into             |
| --------------------------------- | --------------------- |
| Transaction pooler, port **6543** | `DATABASE_URL`        |
| Session pooler, port **5432**     | `DIRECT_DATABASE_URL` |

Replace `[YOUR-PASSWORD]` in both strings with the database password from step 1.
If the password contains `@`, `:`, `/`, `#` or `?`, URL-encode those characters
(for example `@` becomes `%40`), or generate a new password without them.

## 4. Create your login user and switch off public sign-ups

1. Sidebar → **Authentication** → **Users** → **Add user** → **Create new user**.
   Enter your email and a password, tick **Auto Confirm User**, then **Create user**.
   This is the only account the app will have; there is no sign-up screen.
2. Sidebar → **Authentication** → **Sign In / Providers** → **Email**: keep Email enabled but
   turn **off** "Allow new users to sign up". Save. (Users you add from the dashboard still work.)

## 5. Apply the database schema and seed your data (on your computer)

Needs Node.js 20.9 or newer and git.

```bash
git clone https://github.com/Vinit-Chandak/gym-tracker.git
cd gym-tracker
git checkout claude/zip-review-vercel-postgres-rq1iyx   # or main, once merged
npm install
cp .env.example .env.local
```

Open `.env.local` and paste the four values from steps 2 and 3. Set `SEED_USER_EMAIL` to the
email you used in step 4. Then:

```bash
npm run db:setup   # creates all tables + security policies, seeds exercises, equipment types,
                   # warm-ups, your three gyms, Anytime Fitness equipment and the 8-week programme
npm run dev        # open http://localhost:3000 and sign in
```

After pulling later commits, run `npm run db:migrate` again: it applies only the migrations in
`src/db/migrations/` that the database has not seen yet. `npm run db:setup` is also safe to
re-run, because the seed is idempotent.

`npm run db:seed` is safe to run again: it only adds what is missing.

## 6. Deploy to Vercel (free Hobby plan)

1. <https://vercel.com/new> → **Import** the GitHub repository `Vinit-Chandak/gym-tracker`.
2. Framework preset: Next.js (detected automatically). Leave build settings as they are.
3. **Environment Variables**: add the same four values as in `.env.local`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`,
   `DIRECT_DATABASE_URL`. Tick Production and Preview. `SEED_USER_EMAIL` is not needed on Vercel.
4. **Deploy**, then open the URL and sign in.
5. Optional but recommended: Project **Settings → Functions → Function Region** → **Mumbai
   (bom1)** so the app and the database sit in the same region.

## 7. Install on the iPhone

Open the Vercel URL in Safari → **Share** → **Add to Home Screen**. It launches full-screen.

## 8. Optional: let Claude Code run the database steps for you

If you would rather not run step 5 locally: add `DIRECT_DATABASE_URL` and `SEED_USER_EMAIL` as
environment variables in the Claude Code environment settings (never paste secrets into the
chat), then ask for `npm run db:setup` to be run from a session.

## What to check in the app after seeding

- Settings shows your email and the default gym (Anytime Fitness).
- Gyms: Anytime Fitness has the seven machines from the planning notes; Samsung Gym and
  Society Gym are empty until you add their equipment (Phase 2 screens).

## Free-tier notes

- Supabase pauses free projects after seven days without any request; the dashboard shows a
  **Restore** button, and data is kept.
- Vercel Hobby is plenty for a single user.
