#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" == "Darwin" ]]; then
  default_interface="$(route get default 2>/dev/null | awk '/interface:/{print $2; exit}' || true)"

  if [[ -n "${default_interface}" ]]; then
    default_ip="$(ipconfig getifaddr "${default_interface}" 2>/dev/null || true)"
    if [[ -n "${default_ip}" ]]; then
      printf '%s\n' "${default_ip}"
      exit 0
    fi
  fi

  for interface in en0 en1 en2; do
    ip="$(ipconfig getifaddr "${interface}" 2>/dev/null || true)"
    if [[ -n "${ip}" ]]; then
      printf '%s\n' "${ip}"
      exit 0
    fi
  done
fi

if command -v hostname >/dev/null 2>&1; then
  hostname -I 2>/dev/null | tr ' ' '\n' | awk '/^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/{print; exit}' || true
fi
