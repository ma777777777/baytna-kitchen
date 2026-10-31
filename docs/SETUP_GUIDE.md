# Setting up Baytna Kitchen for the two of you

About 30 minutes, once. Everything here is on free plans: Supabase (database, login, live sync) and Vercel (hosting). Do it on a laptop.

## 1. Create the Supabase project (10 min)

1. Go to https://supabase.com, sign up, and click **New project**.
   - Name: `baytna-kitchen`. Region: **Central EU (Frankfurt)** is the closest to Lebanon.
   - Save the database password somewhere safe. The app doesn't need it.
2. When the project is ready, open **SQL Editor → New query**. Paste the whole file `supabase/migrations/20261030000000_init.sql` and click **Run**. You should see "Success. No rows returned".
3. **Make sign-in emails contain a code.** On iPhone, a sign-in *link* opens in Safari instead of the installed app, so we use a 6-digit code instead.
   Open **Authentication → Emails → Templates**. For both **Magic link** and **Confirm signup**:
   - Subject: `Your Baytna Kitchen code · كود مطبخ بيتنا`
   - Body: paste the contents of `supabase/templates/code.html` (it contains `{{ .Token }}`, which becomes the code).
   - Save.
4. **Let the email reach your wife.** Supabase's built-in email sender only delivers to members of your Supabase team, and only about 2 emails an hour ([Supabase docs](https://supabase.com/docs/guides/auth/auth-smtp)). That's enough for two people who sign in once, but her address must be on the team:
   **Organization settings → Team → Invite member** → her email (any role, for example Read-only).
   *Optional, more robust:* connect a free email service such as Resend or Brevo under **Authentication → Emails → SMTP Settings**. Then any address works and the limits are much higher.
5. Open **Project Settings → API** (on newer dashboards, **API Keys**) and copy:
   - the **Project URL** (`https://xxxx.supabase.co`)
   - the **anon / publishable** key. This one is safe to put in the app. Never use the `service_role` or secret key.

## 2. Put the code on GitHub (2 min)

Create an empty **private** repository on GitHub called `baytna-kitchen` (no README). Tell me in the thread and I'll push the code to it. If you'd rather do it yourself: `git init && git add . && git commit -m "Baytna Kitchen v1" && git remote add origin … && git push -u origin main`.

## 3. Deploy on Vercel (5 min)

1. Go to https://vercel.com and sign in with GitHub.
2. **Add New → Project**, then import `baytna-kitchen`. Vercel detects Vite by itself.
3. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon/publishable key
4. Click **Deploy**. You get an address like `https://baytna-kitchen.vercel.app`. Every future update I push redeploys automatically.
5. Back in Supabase, open **Authentication → URL Configuration** and set **Site URL** to that address.

A custom domain (for example `baytna.yourname.com`) is optional: in Vercel, open **Settings → Domains**.

## 4. Connect your two accounts (3 min)

1. On your phone, open the app address, choose a language, enter your email, and type the code you receive.
2. Enter your name and tap **Create our kitchen**.
3. Open **Settings (⚙) → Invite your partner** and tap **WhatsApp**. The link and an 8-character code are sent; they work once and expire in 7 days.
4. Your wife opens the link, signs in with her own email code, enters her name and taps **Join**. You now share one kitchen, and anything either of you changes shows on the other phone within about a second.

## 5. Install on both phones

- **iPhone**: open the address in **Safari** (it must be Safari), tap **Share → Add to Home Screen → Add**. Open it from the new icon from now on. After installing you may need to sign in once more inside the installed app.
- **Android (Samsung or other)**: open it in **Chrome**, tap **⋮ → Install app** (or **Add to Home screen**).

The installed app opens without internet and shows the last synced plan and list. Ticks and edits made offline are saved on the phone and sync when you're back online; the badge at the top shows "Offline" or "N waiting".

## Good to know

- **Free-plan pause:** Supabase pauses free projects after about a week with no activity. Daily use prevents this. If it ever pauses, open the Supabase dashboard and click **Restore**.
- **Your data:** Settings → **Export our data** downloads everything (JSON and a CSV of the plan).
- **Security:** each household can only see its own data (enforced in the database, and tested). Invites are single use and expire after 7 days, and a kitchen is capped at two members. You can raise the cap in the `households.max_members` column if you ever want to add a helper.
- **Costs:** $0 a month at your usage.
