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

## Uploaded files

Images, fonts and media uploaded to the design are written once each under
`assets/` — 6 in this export — and the exported files refer to them there. A
reference a script puts together while the page runs (for example
`"/_blob/" + id`) is not rewritten and does not load from this folder.

## Viewing

Serve the folder (e.g. `python3 -m http.server`) and open `P-Breadboard.dc.html`;
some browsers block the scripts over file://.

## Run and deploy

- `npm ci`, then `npm run db:setup` once for a development database (creates the `subscribers` and `subscription_rate_limits` tables).
- `npm start` serves the site and `/api/subscribe` at http://localhost:8000. It reads `DATABASE_URL` from `.env.local`, which `neon deploy` writes.
- Vercel: import the repo and add `DATABASE_URL` as a server-side environment variable. `vercel.json` serves the page at `/`, and `api/subscribe.js` runs as a serverless function. Before deploying this security update, review and apply `db/migrations/001_subscription_rate_limits.sql` to the target database. Do not use a production connection for local development or preview deployments.

## Security and contributor checks

- Copy `.env.example` to `.env.local` and provide the Neon connection string locally. `.env` and other credential files are ignored by Git.
- Subscription requests use parameterized SQL, normalize email addresses, and rely on the database unique constraint for duplicate handling. A shared database counter limits requests to 10 per client address per minute across serverless instances. The runtime database role must have `SELECT`, `INSERT`, and `UPDATE` access to the rate-limit table.
- `npm run db:setup` is an explicit schema setup command. Production schema changes must be reviewed and applied manually; deployments do not run migrations.
- GitHub Actions runs syntax checks and npm audit on pull requests to `main` and pushes to `main`. No test, lint, or build scripts currently exist, so those are reported as not configured.
- CodeRabbit configuration is included in `.coderabbit.yaml`. A repository owner must install/authorize the CodeRabbit GitHub App for reviews to run; configuration alone does not enable the integration. Keep human review required for security-sensitive changes.
