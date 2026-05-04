#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

failures=0
warnings=0

note() {
  printf '%s\n' "$*"
}

fail() {
  failures=$((failures + 1))
  printf 'ERROR: %s\n' "$*" >&2
}

warn() {
  warnings=$((warnings + 1))
  printf 'WARNING: %s\n' "$*" >&2
}

mask_value() {
  local value="${1:-}"
  if [[ -z "${value}" ]]; then
    printf '<missing>'
  else
    printf '<set>'
  fi
}

read_env_value() {
  local file="$1"
  local key="$2"
  local line
  line="$(grep -E "^[[:space:]]*${key}=" "${file}" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%%#*}"
  line="${line%\"}"
  line="${line#\"}"
  line="${line%\'}"
  line="${line#\'}"
  printf '%s' "$(printf '%s' "${line}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
}

require_file() {
  local file="$1"
  if [[ ! -f "${file}" ]]; then
    fail "Missing ${file}. Copy the matching .env.example and fill in local values."
    return 1
  fi
  note "OK: ${file} exists"
}

require_env_key() {
  local file="$1"
  local key="$2"
  local value
  value="$(read_env_value "${file}" "${key}")"

  if [[ -z "${value}" ]]; then
    fail "${file} is missing ${key}"
    return 1
  fi

  note "OK: ${key}=$(mask_value "${value}")"
}

if [[ ! -d "backend" || ! -d "MusicAIApp" ]]; then
  fail "Run this script from the TuneUp repository root."
fi

note "TuneUp demo environment check"
note "Repository: ${ROOT_DIR}"
note ""

if require_file "backend/.env"; then
  for key in SUPABASE_URL SUPABASE_KEY SUPABASE_AUDIO_BUCKET SUPABASE_AUDIO_PREFIX CORS_ALLOW_ORIGINS; do
    require_env_key "backend/.env" "${key}"
  done
fi

note ""

if require_file "MusicAIApp/.env"; then
  for key in EXPO_PUBLIC_API_BASE_URL EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY; do
    require_env_key "MusicAIApp/.env" "${key}"
  done

  api_base_url="$(read_env_value "MusicAIApp/.env" "EXPO_PUBLIC_API_BASE_URL")"
  lan_ip="$("${ROOT_DIR}/scripts/print-lan-ip.sh" | awk 'NF{print; exit}' || true)"

  if [[ "${api_base_url}" == *"YOUR_LOCAL_IP"* || "${api_base_url}" == *"YOUR_MAC_LAN_IP"* ]]; then
    warn "EXPO_PUBLIC_API_BASE_URL still contains a placeholder. Use your current Mac LAN IP."
  elif [[ "${api_base_url}" == *"localhost"* || "${api_base_url}" == *"127.0.0.1"* ]]; then
    warn "EXPO_PUBLIC_API_BASE_URL uses localhost. A physical iPhone needs your Mac LAN IP instead."
  elif [[ -n "${lan_ip}" && "${api_base_url}" != *"${lan_ip}"* ]]; then
    warn "Current Mac LAN IP appears to be ${lan_ip}, but EXPO_PUBLIC_API_BASE_URL is different."
  fi

  if [[ "${api_base_url}" != http://* && "${api_base_url}" != https://* ]]; then
    warn "EXPO_PUBLIC_API_BASE_URL should include http:// or https://."
  fi
fi

note ""
lan_ip="$("${ROOT_DIR}/scripts/print-lan-ip.sh" | awk 'NF{print; exit}' || true)"
if [[ -n "${lan_ip}" ]]; then
  note "Detected Mac LAN IP: ${lan_ip}"
  note "Expected Expo API URL for device demos: http://${lan_ip}:8000"
  note "Expected manual Metro URL if needed: http://${lan_ip}:8081"
else
  warn "Could not detect a LAN IP automatically. Check macOS Wi-Fi details."
fi

note ""
if [[ "${failures}" -gt 0 ]]; then
  note "Demo check failed with ${failures} error(s) and ${warnings} warning(s)."
  exit 1
fi

note "Demo check passed with ${warnings} warning(s)."
