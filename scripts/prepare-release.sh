#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 v0.1.0-beta.2"
  exit 1
fi

if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid version: $VERSION"
  echo "Expected SemVer tag format such as v0.1.0-beta.2"
  exit 1
fi

if git rev-parse "$VERSION" >/dev/null 2>&1; then
  echo "Version already exists as a Git ref: $VERSION"
  exit 1
fi

LATEST_TAG="$(git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null || true)"

if [[ -z "$LATEST_TAG" ]]; then
  echo "No previous release tag found."
  echo "A baseline tag must exist before automated release preparation."
  exit 1
fi

echo "Previous release: $LATEST_TAG"
echo "Preparing release: $VERSION"

if [[ "$LATEST_TAG" == "$VERSION" ]]; then
  echo "Requested version is already the latest release."
  exit 1
fi

echo
echo "Commits included:"
git log --oneline "${LATEST_TAG}..HEAD"

if [[ -z "$(git rev-list "${LATEST_TAG}..HEAD")" ]]; then
  echo "No commits exist after $LATEST_TAG."
  exit 1
fi

echo
echo "Generating changelog..."

git-cliff \
  "${LATEST_TAG}..HEAD" \
  --config cliff.toml \
  --tag "$VERSION" \
  --prepend CHANGELOG.md

echo
echo "Release preparation complete:"
echo "  Previous tag: $LATEST_TAG"
echo "  New version:  $VERSION"
