#!/usr/bin/env bash
# Race-safe, incremental commit of fetched data. Called AFTER EACH source so a
# later step's failure never discards what was already processed/saved.
set -u

git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"

git add data/products.json 2>/dev/null || true

if git diff --cached --quiet; then
  echo "No changes to commit"
  exit 0
fi

git commit -m "${1:-chore: product data update}"

# Rebase onto any concurrent change and retry, so a parallel push never loses this commit.
for i in 1 2 3 4 5; do
  if git pull --rebase --autostash origin main && git push origin main; then
    echo "pushed"
    exit 0
  fi
  echo "push attempt $i rejected, retrying in 5s..."
  sleep 5
done

echo "push failed after retries"
exit 1
