# Steel & Zane — Landing Page

Real estate media landing page for Steel & Zane, deployed on Vercel.

## Project structure

```
public/
  index.html   — main landing page
  book.html    — booking questionnaire page
  style.css    — all styles (shared between pages)
  script.js    — landing page JS (contact form, nav, animations)
  book.js      — booking page JS (questionnaire redirect logic)
  complimentary-shoot.html/.css/.js — private BDR landing page (see below)
  privacy.html, terms.html          — DRAFT legal pages (pending review)
api/
  contact.js   — serverless function: handles contact form email via Nodemailer
  lead.js      — serverless function: complimentary-shoot lead saves → Google Sheet
apps-script/
  Code.gs      — Google Apps Script for the leads Sheet (pasted into the Sheet, not deployed by Vercel)
vercel.json    — Vercel config (output directory, security headers)
```

## Local development

```bash
npm install
npm start       # runs: vercel dev
```

Requires the [Vercel CLI](https://vercel.com/docs/cli) installed globally (`npm i -g vercel`).

## Saving and deploying changes

After making edits to any files, run these three commands in your terminal to save them to GitHub and trigger a live deploy:

```bash
git add .
git commit -m "describe what you changed"
git push
```

**What each command does:**

| Command | What it does |
|---------|--------------|
| `git add .` | Stages all changed files, telling Git you want to include them in the next save |
| `git commit -m "..."` | Saves a snapshot of your changes with a short description (replace the message with your own) |
| `git push` | Uploads the commit to GitHub, which triggers Vercel to automatically redeploy your live site |

> **Tip:** Run `git status` at any time to see which files have been changed but not yet committed.

### Working with branches

Branches let you make and test changes without touching the live site until you're ready.

**See all branches:**
```bash
git branch
```
The branch with a `*` next to it is the one you're currently on.

**Switch to an existing branch:**
```bash
git checkout branch-name
```

**Create a new branch and switch to it:**
```bash
git checkout -b new-branch-name
```

**Push a new branch to GitHub for the first time:**
```bash
git push -u origin new-branch-name
```

**Merge a branch into main when you're ready to go live:**
```bash
git checkout main
git merge branch-name
git push
```

> **Tip:** Always commit or stash your changes before switching branches, or Git will warn you that unsaved work may be overwritten.

## Deployment

Push to the `main` branch. Vercel auto-deploys on every push (connected via GitHub integration).

Static files are served from the `public/` directory. The `api/` folder is deployed as Vercel serverless functions.

## Environment variables

Set these in the Vercel dashboard (Settings → Environment Variables):

| Variable    | Description                          |
|-------------|--------------------------------------|
| `SMTP_HOST` | SMTP server hostname                 |
| `SMTP_PORT` | SMTP port (usually `587` or `465`)   |
| `SMTP_USER` | SMTP username / sending email        |
| `SMTP_PASS` | SMTP password or app password        |
| `TO_EMAIL`  | Where contact form emails are sent (defaults to `book@steelandzane.com`) |

For local dev, copy these into `.env.local` (already gitignored).

## Replacing the Spiro booking links

Open `public/book.js` and replace the placeholder URLs in the `SPIRO_LINKS` object at the top of the file:

```js
const SPIRO_LINKS = {
  photosOnly:  'https://REPLACE-WITH-SPIRO-PHOTOS-ONLY-LINK.com',
  photoVideo:  'https://REPLACE-WITH-SPIRO-PHOTO-VIDEO-LINK.com',
  photoDrone:  'https://REPLACE-WITH-SPIRO-PHOTO-DRONE-LINK.com',
  fullPackage: 'https://REPLACE-WITH-SPIRO-FULL-PACKAGE-LINK.com',
  luxury:      'https://REPLACE-WITH-SPIRO-LUXURY-LINK.com',
  commercial:  'https://REPLACE-WITH-SPIRO-COMMERCIAL-LINK.com',
  rental:      'https://REPLACE-WITH-SPIRO-RENTAL-AIRBNB-LINK.com',
  threeD:      'https://REPLACE-WITH-SPIRO-3D-FLOORPLAN-LINK.com',
};
```

### Redirect logic

| Property type selected | Redirects to       |
|------------------------|--------------------|
| Luxury Listing         | `luxury`           |
| Commercial Property    | `commercial`       |
| Rental / Airbnb        | `rental`           |
| Standard Residential + Photos Only      | `photosOnly`  |
| Standard Residential + Photos + Video   | `photoVideo`  |
| Standard Residential + Photos + Drone   | `photoDrone`  |
| Standard Residential + Full Media Package | `fullPackage` |
| Standard Residential + 3D Tour / Floor Plan | `threeD`  |

Luxury, commercial, and rental property types bypass the service selection and go directly to their dedicated links.

## Complimentary Shoot page (`/complimentary-shoot`)

Private, mobile-first page BDRs send to agents after a cold call. Agents watch a short video and request a complimentary Signature shoot through a one-question-per-screen form. Bodhi calls every lead from **323-643-9060** and books the shoot in Spiro by hand (nothing is created in Spiro automatically).

The page has no header or navigation, is `noindex, nofollow` (meta tag + `X-Robots-Tag` header), and is not linked from the rest of the site.

### BDR links

Each sender has two fixed links: one for texts (`src=1`), one for emails (`src=2`). Visits with no parameters are recorded as direct (`src=0`).

| Sender | Code | Text link | Email link |
|--------|------|-----------|------------|
| Bodhi  | 1 | `steelandzane.com/complimentary-shoot?src=1&bdr=1` | `steelandzane.com/complimentary-shoot?src=2&bdr=1` |
| Joshua | 2 | `steelandzane.com/complimentary-shoot?src=1&bdr=2` | `steelandzane.com/complimentary-shoot?src=2&bdr=2` |

**Adding a BDR:** give them the next number, add a row (`code`, `name`) to the `BDRs` tab in the leads Sheet, and hand them their two links. No code change.

**Never put names, emails or phone numbers in these links.** Only `src` values `0/1/2` and 1–3 digit `bdr` codes are accepted; anything else is discarded.

### How leads flow

1. After **every** form screen, the page POSTs all answers so far to `/api/lead` (`api/lead.js`).
2. `api/lead.js` validates the data, drops spam (hidden honeypot field, under-2-second saves, more than 60 saves per IP per 10 min), and forwards it to the Google Apps Script web app.
3. The Apps Script (`apps-script/Code.gs`) upserts **one row per lead** in the `Leads` tab, keyed by `lead_id`, and emails `bodhi@steelandzane.com` at most twice:
   - **New lead (Incomplete)** — as soon as a cell number is captured
   - **Lead COMPLETE** — when the last screen is submitted
4. `status` stays `Incomplete` until the final screen. `last_step` is the furthest screen the agent reached, so drop-offs are easy to spot and call.

If an agent leaves and comes back on the same phone within 30 days, the form resumes where they left off and updates the same row.

### One-time setup: Sheet + Apps Script

1. Create a Google Sheet named **Complimentary Shoot Leads** while signed in as bodhi@steelandzane.com.
2. **Extensions → Apps Script.** Delete the sample code, paste the contents of `apps-script/Code.gs`, and save.
3. In the function dropdown pick **`setup`** and click **Run**. Approve the permission prompts (Sheets + send email as you). This creates the `Leads` and `BDRs` tabs and generates a secret.
4. In the **Execution log** panel that opens at the bottom, copy the value after `LEADS_WEBHOOK_SECRET for Vercel:`. (To see it again later: **Executions** in the left sidebar → the `setup` run.)
5. **Deploy → New deployment →** type **Web app**. Execute as: **Me**. Who has access: **Anyone**. Deploy, then copy the **Web app URL** (ends in `/exec`).
6. In Vercel → Project → **Settings → Environment Variables**, add both for **Production and Preview**:

   | Variable | Value |
   |----------|-------|
   | `LEADS_WEBHOOK_URL` | the Web app URL from step 5 |
   | `LEADS_WEBHOOK_SECRET` | the secret from step 4 |

7. Redeploy in Vercel (Deployments → ⋯ → Redeploy) so the function picks up the variables.

**Changing `Code.gs` later:** paste the new code, then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy.** Editing a deployment this way keeps the same URL. A *new* deployment gets a new URL, and you'd have to update Vercel.

### Still to fill in

All of these are marked in the code:

- **GA4:** set `GA4_ID` at the top of `public/complimentary-shoot.js`. Then in GA4 → Admin → Custom definitions, add event-scoped dimensions `src` and `bdr`. Events: `page_view`, `form_start`, `form_complete`, each with `src` and `bdr`.
- **Vidalytics video:** replace the block marked `VIDALYTICS EMBED` in `public/complimentary-shoot.html` and delete the placeholder div. Configure Smart Autoplay inside Vidalytics.
- **Vidalytics conversion:** paste the conversion snippet into `trackVidalyticsConversion()` in `public/complimentary-shoot.js`. It runs once, after the final screen saves.
- **Legal:** `public/privacy.html` and `public/terms.html` are **drafts** with `[CONFIRM: …]` placeholders. Have them and the form's consent line reviewed before sending any BDR links, then remove the draft banners.

### Images

`public/images/complimentary-shoot/` holds compressed copies of `hero/1.jpg`: `og.jpg` (1200×630, link previews) and `poster-800.jpg` / `poster-1280.jpg` (video poster). The originals are ~3 MB each, far too heavy for a phone on cellular, so always use compressed copies here.

### Testing link previews

iMessage caches previews per URL. When re-testing, add a throwaway parameter (e.g. `?src=1&bdr=1&t=2`). Previews only work on the production domain, because Vercel preview URLs may require a Vercel login.
