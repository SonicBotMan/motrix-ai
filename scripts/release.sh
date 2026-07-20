#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CARGO_TOML="$PROJECT_ROOT/apps/gui/src-tauri/Cargo.toml"

VERSION=$(grep '^version' "$CARGO_TOML" | head -1 | sed 's/version = "\(.*\)"/\1/')
TAG="v$VERSION"

if [ -z "$VERSION" ]; then
  echo "Error: Could not read version from $CARGO_TOML"
  exit 1
fi

if git tag -l "$TAG" | grep -q "$TAG"; then
  echo "Error: Tag $TAG already exists."
  echo "  git tag -d $TAG && git push origin --delete $TAG"
  exit 1
fi

echo "Running pre-release checks for $TAG..."

echo "  [1/7] pnpm lint..."
(cd "$PROJECT_ROOT" && pnpm lint) || { echo "FAIL: lint"; exit 1; }

echo "  [2/7] prettier --check..."
(cd "$PROJECT_ROOT" && pnpm prettier --check .) || { echo "FAIL: format"; exit 1; }

echo "  [3/7] vue-tsc --noEmit..."
(cd "$PROJECT_ROOT/apps/gui" && npx vue-tsc --noEmit) || { echo "FAIL: typecheck"; exit 1; }

echo "  [4/7] pnpm test..."
(cd "$PROJECT_ROOT" && pnpm test) || { echo "FAIL: test"; exit 1; }

echo "  [5/7] cargo fmt --check..."
(cd "$PROJECT_ROOT/apps/gui/src-tauri" && cargo fmt -- --check) || { echo "FAIL: cargo fmt"; exit 1; }

echo "  [6/7] cargo clippy..."
(cd "$PROJECT_ROOT/apps/gui/src-tauri" && cargo clippy --all-targets -- -D warnings) || { echo "FAIL: clippy"; exit 1; }

echo "  [7/7] cargo test..."
(cd "$PROJECT_ROOT/apps/gui/src-tauri" && cargo test --all-targets) || { echo "FAIL: cargo test"; exit 1; }

echo ""
echo "All checks passed. Committing release $TAG..."

cd "$PROJECT_ROOT"
git add -A

if git diff --cached --quiet; then
  echo "No changes to commit."
else
  git commit -m "release: $TAG"
fi

git tag -a "$TAG" -m "$TAG"
git push && git push --tags

echo ""
echo "Released $TAG. Create GitHub Release at:"
echo "  https://github.com/SonicBotMan/motrix-ai/releases/new?tag=$TAG"
