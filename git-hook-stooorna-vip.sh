#!/usr/bin/env bash
# Install / refresh the pre-commit hook that checks VIP real-activation files exist.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${ROOT}" ]]; then
  echo "Not a git repository. Run this from the Stooorna repo root."
  exit 1
fi

HOOK="${ROOT}/.git/hooks/pre-commit"
mkdir -p "${ROOT}/.git/hooks"

cat > "${HOOK}" << 'HOOK'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
fail=0
need() {
  local pattern="$1"
  local label="$2"
  if ! git ls-files | grep -E "${pattern}" >/dev/null 2>&1; then
    if ! find "${ROOT}" -name "$(basename "${pattern}")" 2>/dev/null | grep -q .; then
      echo "VIP hook: missing ${label}"
      fail=1
    fi
  fi
}
need 'vipPatch\.ts$' 'lib/vipPatch.ts'
need 'VipBadge\.tsx$' 'components/VipBadge.tsx'
need 'api-vip\.ts$|api/vip/route\.ts$' '/api/vip route'
if [[ "${fail}" -ne 0 ]]; then
  echo "VIP real-activation files are missing. Apply vip-real-activation patch first."
  exit 1
fi
exit 0
HOOK

chmod +x "${HOOK}"
echo "Installed ${HOOK}"
echo "Test: git hook is executable and will run on commit."
