#!/usr/bin/env bash
#
# Assemble the individually-rendered projects into one _site/ tree.
#
# Run AFTER rendering each Quarto project (see the README, "How it builds and
# deploys"). Each project renders into its own output directory; this script
# copies those outputs into a single _site/ tree that mirrors the published
# URL structure:
#
#   _site/              -> course website (site root / hub)
#   _site/notes         -> Lecture Notes
#   _site/labs          -> R Lab Book
#   _site/homework      -> Homework Solutions
#   _site/quizzes       -> Module Quizzes (questions, keys & Blackboard setup)
#   _site/project       -> Final Project Guide
#   _site/regdatasets   -> regdatasets pkgdown site (built from its own repo)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE="$ROOT/_site"

rm -rf "$SITE"
mkdir -p "$SITE"

# Course website -> site root (the hub)
cp -R "$ROOT/website/_site/." "$SITE/"

# Books -> subpaths
for map in "notes/_book:notes" "labs/_book:labs" "homework/_book:homework" "quizzes/_book:quizzes" "project/_book:project"; do
  src="$ROOT/${map%%:*}"
  dst="$SITE/${map##*:}"
  mkdir -p "$dst"
  cp -R "$src/." "$dst/"
done

# regdatasets pkgdown site is built from its own repository.
# For local builds, pull it from the sibling working copy if present.
REGDOCS="$ROOT/../regdatasets/docs"
if [ -d "$REGDOCS" ]; then
  mkdir -p "$SITE/regdatasets"
  cp -R "$REGDOCS/." "$SITE/regdatasets/"
else
  echo "note: ../regdatasets/docs not found — skipping /regdatasets (built in CI)."
fi

echo "Assembled site at: $SITE"
