#!/usr/bin/env bash
# Fetch and fast-forward the current branch from origin.
# Used by agents, pre-push hook, and manual runs before deploy/push.
set -euo pipefail

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "sync-with-origin: not a git repository" >&2
  exit 1
fi

branch="$(git branch --show-current)"
if [ -z "$branch" ]; then
  echo "sync-with-origin: detached HEAD — skip pull" >&2
  exit 0
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "sync-with-origin: working tree has uncommitted changes; commit or stash before pulling" >&2
  exit 1
fi

echo "sync-with-origin: fetching origin..."
git fetch origin

upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
if [ -n "$upstream" ]; then
  echo "sync-with-origin: pulling $upstream (ff-only)..."
  git pull --ff-only
elif git rev-parse --verify "origin/$branch" >/dev/null 2>&1; then
  echo "sync-with-origin: pulling origin/$branch (ff-only)..."
  git pull --ff-only origin "$branch"
else
  echo "sync-with-origin: no upstream for $branch — fetch only" >&2
fi

echo "sync-with-origin: up to date with origin."
