# P · Breadboard — the build, from parts to a running board — design reference

This is a design mockup created in a visual design tool, exported as a
standalone page. Treat it as a REFERENCE MOCKUP, not production code:
the markup and inline styles carry the design's precise values — colors,
font sizes, spacing, radii, shadows, layout — which an implementation
should replicate faithfully in its own components and styling system
rather than copy wholesale.

## Contents

- `P-Breadboard.dc.html` — the artboard (a Design Component: an `<x-dc>`
  template + a small logic class). The values to replicate live in its
  inline `style="…"` attributes and the `<helmet><style>` block.
- `assets/` — files uploaded to the design (images, fonts, media)
- `support.js`, `vendor/react*.js` — the runtime that renders the
  component in a browser; not part of the design.
- `register.html`, `admin.html`, `portal.css` — the registration portal and
  the admin dashboard (see "Registration and admin" below).
- `privacy.html`, `terms.html` — the privacy policy and terms of service, served
  at `/privacy` and `/terms` and linked from the site's footer and the Google
  consent screen. `brand/` holds the consent-screen logo.

## Uploaded files

Images, fonts and media uploaded to the design are written once each under
`assets/` — 6 in this export — and the exported files refer to them there. A
reference a script puts together while the page runs (for example
`"/_blob/" + id`) is not rewritten and does not load from this folder.

## Viewing

Serve the folder (e.g. `python3 -m http.server`) and open `P-Breadboard.dc.html`;
some browsers block the scripts over file://.

## Run and deploy

- `npm ci`, then `npm run db:setup` once for a development database. It creates the `subscribers` table and applies everything in `db/migrations/` (the rate-limit table and the registration tables); it is safe to re-run.
- `npm start` serves the site, `/register`, `/admin` and the API at http://localhost:8000. It reads `DATABASE_URL` and the mail settings below from `.env.local`, which `neon deploy` writes.
- Vercel: import the repo and add `DATABASE_URL` and the mail settings as server-side environment variables. `vercel.json` serves the page at `/`, the portal at `/register` and the dashboard at `/admin`; each file in `api/` runs as a serverless function (`api/_lib/` is shared code, not a function). Before deploying, review and apply `db/migrations/001_subscription_rate_limits.sql` and `db/migrations/002_registration.sql` to the target database. Do not use a production connection for local development or preview deployments.

## Registration and admin

- **Register now** in the site's nav opens `/register`. It is open to undergraduate and postgraduate students of VIT and of any other college, research scholars and working professionals. A person signs in with their Google account (which also verifies their email), fills in their profile (VIT or external; student, professional or researcher; contact, education, VIT campus, registration number and hostel details, special requirements), then starts a team or joins one with its 6-character code or invite link. Teams have 3 to 5 members; the person who starts a team is its leader and can hand leadership to another member.
- The leader picks the track and problem statement, lists the components the team needs, and submits the solution (title, summary, and links to a repository, a demo video and a document). Members see these read-only. The document is a link (Google Drive, OneDrive, Docs) rather than an upload, so no file storage is needed.
- Everything is stored in the Neon database: `participants`, `teams`, `team_members`, `submissions`, plus `email_codes`, `sessions` and `rate_limits` for sign-in.
- `/admin` shows every participant, team, component request (with totals across teams), submission and notify-me subscriber, with search, filters, a full-record view and CSV export. Only the addresses in `ADMIN_EMAILS` (comma-separated) can open it; when it is unset the admin is `sarthaktrivedi386@gmail.com`. Admins sign in the same way, with Google. Admin sessions last 12 hours, participant sessions 30 days.
- Event settings live in `api/_lib/event.js`: team size, tracks, campuses, and switches that close registration, the components form or submissions. Problem statements are not released yet; when they are, add them to their track there as `{ id: 'FW-01', title: '…' }` and teams can pick them.

### Google sign-in

"Continue with Google" appears on `/register` and `/admin` once `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. Any Google account can sign in (it is not limited to VIT accounts), and the email it returns is already verified by Google. A person who signs in with Google and later with an emailed code to the same address reaches the same registration.

1. In [Google Cloud console](https://console.cloud.google.com/), create a project and open **Google Auth Platform → Branding** (older consoles: **APIs & Services → OAuth consent screen**, user type **External**). Fill it in as below (the live site answers on `www.makeathon.in`; `makeathon.in` redirects there):

   | Field | Value |
   | --- | --- |
   | App name | `Makeathon 2027` (people see it as "Sign in to Makeathon 2027") |
   | User support email | an address you or a Google Group you manage receives |
   | App logo | `brand/google-consent-logo-120.png` (see the note below) |
   | Application home page | `https://www.makeathon.in/` |
   | Application privacy policy link | `https://www.makeathon.in/privacy` |
   | Application terms of service link | `https://www.makeathon.in/terms` |
   | Authorized domains | `makeathon.in` |
   | Developer contact information | your email |

   **Data access / scopes:** add nothing. The site asks only for `openid` and `email`, which are non-sensitive. **Audience:** publish the app (move it out of Testing), otherwise only listed test users can sign in.
2. **Clients → Create client → Web application** (older consoles: **Credentials → Create credentials → OAuth client ID**). Under **Authorized redirect URIs** add `https://www.makeathon.in/api/google`, `https://makeathon.in/api/google` and, for local runs, `http://localhost:8000/api/google`. The address must match the host people actually browse on, which is `www`.
3. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (Vercel environment variables, and `.env.local` locally).

**The logo and verification.** With only the basic scopes and no logo, a published app works for anyone without a Google review. Uploading a logo makes Google require brand verification before the logo is shown. For that review Google checks that you own the domain (add it as a property in [Google Search Console](https://search.google.com/search-console) and verify it with a DNS TXT record), that the home page describes Makeathon and links to the privacy policy (the site's footer has **Privacy** and **Terms** links), and that the policy describes how Google data is used (`privacy.html` section 04). Brand verification usually takes a few business days, so you can launch without the logo and add it afterwards.

Vercel preview deployments have their own URLs, which Google rejects unless each is registered; sign in there with an emailed code. If the site sits behind a proxy that changes the Host header, set `PUBLIC_URL` to the public origin.

### Email codes (optional)

Sign-in is Google-only by default. To also offer a 6-digit code by email, for people who do not want to use a Google account, set the SMTP variables below; the option appears on `/register` and `/admin` as soon as `SMTP_HOST` is set, and disappears again if it is removed. Set these variables:

| Variable | Example |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` (SSL) or `587` (STARTTLS) |
| `SMTP_USER` | the sending account, e.g. `makeathon@gmail.com` |
| `SMTP_PASS` | its password; for Gmail an [app password](https://myaccount.google.com/apppasswords), which needs 2-step verification on |
| `MAIL_FROM` | `Makeathon 2027 <makeathon@gmail.com>` (defaults to `SMTP_USER`) |

Without `SMTP_HOST` the email-code option is hidden. (The `/api/auth` endpoint still works in a local run, printing each code in the server console, which the tests use; a deployed site refuses to send codes.) Gmail allows about 500 messages a day; a transactional provider's SMTP (Brevo, Resend, Amazon SES) suits a larger event.

## Security and contributor checks

- Copy `.env.example` to `.env.local` and provide the Neon connection string locally. `.env*` files other than the example are ignored by Git.
- Subscription and registration requests use parameterized SQL and validate every field on the server. Shared database counters limit requests per client address (and, for sign-in codes, per email address) across serverless instances. The runtime database role needs `SELECT`, `INSERT`, `UPDATE` and `DELETE` on the registration tables and `SELECT`, `INSERT` and `UPDATE` on the rate-limit tables.
- Sign-in codes and session tokens are stored only as SHA-256 hashes. A code expires after 10 minutes or 5 wrong guesses. Google sign-in uses the authorization-code flow with PKCE and a `state` check, runs entirely on the server (no Google script on our pages), and only accepts addresses Google reports as verified. The session cookie is `HttpOnly`, `SameSite=Lax` and, when deployed, `Secure`; state-changing requests from another site are refused.
- `npm run db:setup` is an explicit schema setup command. Production schema changes must be reviewed and applied manually; deployments do not run migrations.
- GitHub Actions runs syntax checks and npm audit on pull requests to `main` and pushes to `main`. No test, lint, or build scripts currently exist, so those are reported as not configured.
- CodeRabbit configuration is included in `.coderabbit.yaml`. A repository owner must install/authorize the CodeRabbit GitHub App for reviews to run; configuration alone does not enable the integration. Keep human review required for security-sensitive changes.
