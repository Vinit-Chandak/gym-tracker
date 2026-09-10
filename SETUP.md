# Setup guide — the steps only you can do

Everything below happens outside the code: creating the Supabase project, the Vercel project,
and filling in environment variables. Do the steps in order; the whole thing takes about
20 minutes. Nothing here needs the secret/service-role key.

Once it is deployed, anyone you share the URL with signs up for themselves. Each account has
its own gyms, machines, programme and history, and Row Level Security keeps them apart.

## 1. Create the Supabase project (free plan)

1. Go to <https://supabase.com/dashboard> and sign in (GitHub login is fine).
2. **New project**.
   - Organization: your personal org (Free plan).
   - Name: `overload` (any name works).
   - Database password: click **Generate a password** and save it in your password manager.
     You need it in step 3.
   - Region: whichever is closest to the people who will use it.
3. Wait until the project shows **Active** (one to two minutes).

## 2. Copy the two browser-safe keys

Left sidebar → **Project Settings** (gear) → **API Keys**.

| Dashboard value                                           | Goes into                       |
| --------------------------------------------------------- | ------------------------------- |
| Project URL (looks like `https://abcd1234.supabase.co`)   | `NEXT_PUBLIC_SUPABASE_URL`      |
| Publishable key (`sb_publishable_...`) or legacy anon key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

Do **not** copy the secret or service-role key anywhere in this project, unless you decide to
enable full account deletion (step 5).

## 3. Copy the two database connection strings

Top bar → **Connect** → choose the plain URI view.

| Connection type                   | Goes into             |
| --------------------------------- | --------------------- |
| Transaction pooler, port **6543** | `DATABASE_URL`        |
| Session pooler, port **5432**     | `DIRECT_DATABASE_URL` |

Replace `[YOUR-PASSWORD]` in both strings with the database password from step 1.
If the password contains `@`, `:`, `/`, `#` or `?`, URL-encode those characters
(for example `@` becomes `%40`), or generate a new password without them.

## 4. Turn sign-ups on and point the email links at the app

1. Sidebar → **Authentication** → **Sign In / Providers** → **Email**: keep Email enabled and
   leave **"Allow new users to sign up"** switched **on**. That is what lets your friends
   create their own accounts.
   - **Confirm email** on (the default) means a new account has to click a link in an email
     before it can sign in. The app handles both settings: with it on, sign-up says "check
     your inbox"; with it off, sign-up goes straight into the app.
   - The free tier's built-in email sender is rate-limited to a few messages an hour. If you
     invite more than a handful of people at once, either switch **Confirm email** off or add
     your own SMTP provider under **Authentication → Emails**.
2. Sidebar → **Authentication** → **URL Configuration**. Both boxes matter, and getting them
   wrong is what makes confirmation emails link to `localhost`:
   - **Site URL**: your deployed URL, e.g. `https://overload.vercel.app`, with no trailing
     slash. A new project starts at `http://localhost:3000`, and that is the address Supabase
     falls back to whenever it will not accept the one the app asked for — so leaving it is
     how a deployed app emails people a link to their own machine.
   - **Redirect URLs**: add exactly `https://overload.vercel.app/auth/confirm`, and
     `http://localhost:3000/auth/confirm` as well if you develop locally.

   Every link the app asks Supabase to email — confirmation and password reset — lands on
   `/auth/confirm`, which creates the session and forwards the user on. The app asks for that
   address and nothing more: no `?next=`, no other query string. Supabase compares the **whole**
   address it is given against this list, so an entry that is missing part of one does not match
   and the Site URL is used instead. If you ever need to allow-list a URL that does carry a
   query string, end the pattern with `**`.

## 5. Optional: let people delete their sign-in as well as their data

**Settings → Delete account** always erases every row a user owns — gyms, machines,
programmes, sessions, sets, runs and API tokens. Removing the _sign-in record_ itself needs
Supabase's service-role key, which this project deliberately does not require.

If you want deletion to remove the login too, add `SUPABASE_SERVICE_ROLE_KEY` (Project
Settings → API Keys → secret key) to the server-side environment variables. Leave it out and
the app says plainly that the login remains, which you can then remove from the dashboard.

## 6. Apply the database schema and shared data (on your computer)

Needs Node.js 20.9 or newer and git.

```bash
git clone https://github.com/Vinit-Chandak/gym-tracker.git
cd gym-tracker
npm install
cp .env.example .env.local
```

Open `.env.local` and paste the four values from steps 2 and 3. Then:

```bash
npm run db:setup   # creates all tables + security policies, then seeds the shared library:
                   # equipment types, exercises and warm-up protocols
npm run dev        # open http://localhost:3000 and create an account
```

`npm run db:seed` creates **no** gyms, machines or programmes. Those belong to a person, and
each account creates its own in the app.

After pulling later commits, run `npm run db:setup` again for your **local** database: it
applies only the migrations the database has not seen yet, then re-seeds the shared library.
Both are safe to repeat — the seed upserts by slug and touches nothing a user owns.

Your **deployed** database looks after itself; see step 7.

## 7. Deploy to Vercel (free Hobby plan)

1. <https://vercel.com/new> → **Import** the GitHub repository `Vinit-Chandak/gym-tracker`.
2. Framework preset: Next.js (detected automatically). Leave build settings as they are —
   `vercel.json` sets the build command, so the database is brought up to date first.
3. **Environment Variables**: add the four values from `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`,
   `DIRECT_DATABASE_URL`). Tick Production and Preview.
   Also set `NEXT_PUBLIC_SITE_URL` to the production URL, so emailed links always point at
   production rather than at whichever preview deployment sent them.
4. Recommended: add `SUPABASE_JWKS` as well. Open
   `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json` in a browser (the project
   ref is the first part of `NEXT_PUBLIC_SUPABASE_URL`), copy the whole JSON document and paste
   it as the value, on one line. These are the project's _public_ signing keys, so they are safe
   to store. With them embedded, a freshly started server instance verifies a session without
   first fetching the keys from Supabase, which is otherwise the first thing every cold start
   waits for. If you rotate the signing key in the Supabase dashboard, paste the new document.
5. **Deploy**, then open the URL and create your account.
6. Optional but recommended: Project **Settings → Functions → Function Region** → the region
   nearest your Supabase project, so the app and the database sit together. Check that
   **Fluid Compute** is enabled for the project too: it keeps an instance alive between requests
   instead of starting a new one for each, which is the difference between a tap answering in a
   fraction of a second and in one to two seconds.

### What a production deploy does to the database

`vercel.json` runs `npm run db:deploy` before the build. It applies any migration the database
has not seen, then re-seeds the shared library, so the schema and the exercise catalogue can
never lag behind the code that is about to be served. Neither step touches a row a user owns.

If it cannot do that — the database is unreachable, a migration fails — **the build stops and
nothing is deployed**. The previous deployment keeps serving, which is the right outcome:
shipping code the database cannot answer is what produces "This page couldn't load" on every
screen.

**Preview deployments skip it.** Step 3 ticks the database variables for Preview as well, so
previews share the production database — and a preview is built from a branch nobody has
merged. Migrating from there would apply an unreviewed migration to everybody's data. If you
later give previews a database of their own, set `MIGRATE_ON_PREVIEW=1` on that environment.

A preview built from a branch that adds a migration therefore runs against a database without
it, and its pages will error until the branch is merged and deployed to production. That is
the trade: previews cannot break production data.

## 8. Install it on a phone

- **Android (Chrome)**: open the URL, then either tap **Install** on the card in Settings, or
  use the ⋮ menu → **Add to Home screen**.
- **iPhone (Safari)**: open the URL → **Share** → **Add to Home Screen**.

Either way it launches full-screen with the correct padding for notches and gesture bars.

## What a new account sees

1. **Sign up** with an email and password.
2. **Welcome**, four short steps: about you → the first gym → tick which machines that gym has
   → pick a programme, or skip it. The first step asks for a name, time zone (proposed by the
   device), units, body weight, height, date of birth, sex and a training goal, and is the one
   step that cannot be skipped — the rest of the app reads those numbers. Sex may be left as
   "prefer not to say".
3. **Today** suggests the next session; everything set up in onboarding is editable in
   **Settings → Profile** afterwards, and an account that predates a question is told there
   which answers are still missing rather than being sent back through setup.

## If the email links point at localhost

Almost always step 4.2 above. Supabase builds the link from the address the app asks it to use,
but only if that address is on the **Redirect URLs** list; otherwise it silently uses the
**Site URL**, which on a new project is `http://localhost:3000`. So:

1. Set **Site URL** to your deployed URL. Even when everything else is right, this is the
   fallback, and it should never be a developer machine on a deployed project.
2. Check the **Redirect URLs** list has your deployed URL followed by `/auth/confirm`, spelled
   exactly — `https` not `http`, no trailing slash, no `www` you do not actually use.
3. Set `NEXT_PUBLIC_SITE_URL` (step 7.3) to that same deployed URL, so the app asks for the
   production address from every deployment rather than whichever host served the request.

Links already sent keep pointing wherever they pointed; sign up again, or ask for a fresh
password reset, once the settings are right.

## Free-tier notes

- Supabase pauses free projects after seven days without any request; the dashboard shows a
  **Restore** button, and data is kept.
- Vercel Hobby is plenty for a small group of friends.
- The first tap after a quiet spell can still take a second or two: that is a new server instance
  starting, not the database. Everything after it, while the instance stays warm, is fast. A
  monitoring service pinging the sign-in page every few minutes keeps an instance warm for the
  price of a few requests an hour.
