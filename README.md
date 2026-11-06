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

- `npm install`, then `npm run db:setup` once (creates the `subscribers` table).
- `npm start` serves the site and `/api/subscribe` at http://localhost:8000. It reads `DATABASE_URL` from `.env.local`, which `neon deploy` writes.
- Vercel: import the repo and add `DATABASE_URL` as an environment variable. `vercel.json` serves the page at `/`, and `api/subscribe.js` runs as a serverless function.
