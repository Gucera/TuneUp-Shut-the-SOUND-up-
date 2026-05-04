#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ ! -d "backend" || ! -d "MusicAIApp" ]]; then
  printf 'ERROR: Run this script from the TuneUp repository root.\n' >&2
  exit 1
fi

lan_ip="$("${ROOT_DIR}/scripts/print-lan-ip.sh" | awk 'NF{print; exit}' || true)"

printf 'TuneUp viva demo startup helper\n'
printf 'Repository: %s\n\n' "${ROOT_DIR}"

"${ROOT_DIR}/scripts/check-demo-env.sh" || {
  printf '\nFix the errors above before starting the live demo.\n' >&2
  exit 1
}

printf '\nOpen two terminals and run:\n\n'
printf 'Terminal 1: Backend\n'
printf '  cd "%s/backend"\n' "${ROOT_DIR}"
printf '  source .venv/bin/activate  # or source venv/bin/activate if that is your local env\n'
printf '  python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000\n\n'

printf 'Terminal 2: Expo Metro\n'
printf '  cd "%s/MusicAIApp"\n' "${ROOT_DIR}"
printf '  npx expo start --dev-client -c --host lan\n\n'

if [[ -n "${lan_ip}" ]]; then
  printf 'Current Mac LAN IP: %s\n' "${lan_ip}"
  printf 'MusicAIApp/.env should use:\n'
  printf '  EXPO_PUBLIC_API_BASE_URL=http://%s:8000\n' "${lan_ip}"
  printf 'Manual iPhone dev-build Metro URL if discovery fails:\n'
  printf '  http://%s:8081\n' "${lan_ip}"
else
  printf 'Could not detect a LAN IP automatically. Check macOS Wi-Fi details before opening the iPhone app.\n'
fi

printf '\nHealth check once backend is running:\n'
printf '  curl http://localhost:8000/health\n'
