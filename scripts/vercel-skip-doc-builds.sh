#!/usr/bin/env bash
#
# Vercel "Ignored Build Step" — wired up via vercel.json's `ignoreCommand`.
#
#   exit 0  →  SKIP the build. Vercel marks the deployment ready by reusing
#              the previous build's output, so the commit can never "fail".
#   exit 1  →  run the build.
#
# We skip when a commit changes ONLY files that have zero effect on the
# built app: documentation (`docs/**`, any `*.md`), the root
# `executive-summary.html`, `.env.example`, editor/CI dotfiles, tests /
# e2e / scripts (not bundled), and the hand-derived SQL migrations (applied
# out-of-band with `prisma db execute`, never during `next build`).
#
# Anything under `src/`, `public/`, the Prisma schema/seed, or a
# build-config file forces a real build.
set -uo pipefail

CUR="${VERCEL_GIT_COMMIT_SHA:-$(git rev-parse HEAD)}"
PREV="${VERCEL_GIT_PREVIOUS_SHA:-}"

# Vercel's clone can be shallow / the previous SHA may be absent (first
# deploy, force-push). Try to resolve a parent; if we can't, build.
if [ -z "$PREV" ] || ! git cat-file -e "${PREV}^{commit}" 2>/dev/null; then
  git fetch --depth=2 origin "$CUR" >/dev/null 2>&1 || true
  PREV="$(git rev-parse "${CUR}^" 2>/dev/null || true)"
fi
if [ -z "$PREV" ] || ! git cat-file -e "${PREV}^{commit}" 2>/dev/null; then
  echo "vercel-ignore: no comparable previous commit — building."
  exit 1
fi

# Paths whose changes REQUIRE a build.
BUILD_PATHS=(
  src
  public
  package.json
  package-lock.json
  next.config.mjs
  tsconfig.json
  postcss.config.js
  tailwind.config.ts
  prisma/schema.prisma
  prisma/seed.ts
  vercel.json
  scripts/vercel-skip-doc-builds.sh
)

if git diff --quiet "$PREV" "$CUR" -- "${BUILD_PATHS[@]}"; then
  changed="$(git diff --name-only "$PREV" "$CUR" | head -20 | sed 's/^/  /')"
  echo "vercel-ignore: docs / metadata only (${PREV:0:7}..${CUR:0:7}) — skipping build."
  echo "$changed"
  exit 0
fi

echo "vercel-ignore: build-relevant change (${PREV:0:7}..${CUR:0:7}) — building."
exit 1
