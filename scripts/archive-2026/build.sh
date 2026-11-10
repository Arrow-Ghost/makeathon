#!/usr/bin/env bash
# Rebuilds archive/2026 — the Makeathon 2026 site (Next.js) as static files served at /archive/2026.
# Usage: bash scripts/archive-2026/build.sh   (needs node, npm, curl, perl; network access)
set -euo pipefail

REPO=Kaustubh-sandy/makeathon_2026
COMMIT=21695fa6597ea39026a2a689aced9793a4498337 # last commit, 2026-03-25
BASE=/archive/2026

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$COMMIT" | tar -xz -C "$WORK" --strip-components=1
cd "$WORK"

# Live-event pieces a static archive can't run: Firebase dashboard, organisers' control room, API route.
rm -rf src/app/control-room src/app/api src/app/component/liveDashboard.tsx src/lib/firebase.js
# Static export under $BASE, final registration count, no live forms (see archive.patch).
patch -p1 --forward < "$HERE/archive.patch"
# next/image, <video> and CSS url() don't get the basePath added, so prefix public paths by hand.
find src -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) \
  -exec perl -pi -e "s#([\"'(])/(assets|fonts)/#\$1$BASE/\$2/#g" {} +

npm ci --no-audit --no-fund
npx next build

node "$HERE/prune.mjs" out "$BASE"

rm -rf "$ROOT/archive/2026"
mkdir -p "$ROOT/archive"
cp -R out "$ROOT/archive/2026"
echo "archive/2026 rebuilt from $REPO@${COMMIT:0:7}"
