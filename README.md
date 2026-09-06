# Workplan

A daily block-by-block workplan and adherence tracker, built around your schedule:
Prayer → Bible study → Reading → TBV work → Kitchen and All → HeySasa → Family →
HeySasa top-up → Wind down.

Two modes:
- **Today** — check off tasks as you go
- **Plan tomorrow** — write out tomorrow's tasks before you close out today
- **Month** — see your adherence for the month at a glance

## 1. Set up Supabase (one table, no auth)

1. In your Supabase project, open the SQL editor.
2. Paste and run `sql/schema.sql` from this folder. That's the only table this app needs.
3. Go to Project Settings → API and copy your **Project URL** and **anon public key**.

## 2. Run it locally (optional, to test before deploying)

```
npm install
cp .env.example .env
# paste your Supabase URL and anon key into .env
npm run dev
```

## 3. Deploy to Netlify

1. Push this folder to a GitHub repo (or drag-and-drop the built `dist` folder into Netlify — see below).
2. In Netlify: **Add new site → Import an existing project**, pick the repo.
3. Build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Go to **Site configuration → Environment variables** and add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy.

If you'd rather not connect GitHub, you can build locally (`npm run build`) and
drag the resulting `dist` folder straight into Netlify's "Deploy manually" drop zone —
just make sure your `.env` is filled in before you run the build, since Vite bakes
those values in at build time in that case.

## 4. Install it as an app

Once it's live on your Netlify URL (https, required for install):

- **Phone (Android/Chrome):** open the site, tap the menu → "Add to Home screen" / "Install app".
- **iPhone (Safari):** open the site, tap Share → "Add to Home Screen".
- **Laptop (Chrome/Edge):** open the site, click the install icon in the address bar (or menu → "Install Workplan").

It'll open full-screen, no browser chrome, like a native app — that's what
`manifest.json` and the service worker in `public/` are for.

## Notes

- This is single-user and has no login screen — anyone with the URL can read/write it.
  Fine for personal use; if that ever matters, Netlify's paid tiers offer password
  protection for the whole site, or you can add Supabase auth later.
- The block times (5am prayer, 8am–5pm work, etc.) are edit-only in `src/blocks.js` —
  change them any time your schedule shifts.
