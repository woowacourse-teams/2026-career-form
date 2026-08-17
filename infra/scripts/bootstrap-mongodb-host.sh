#!/usr/bin/env bash
set -euo pipefail

readonly REQUIRED_SWAP_KIB=2097152

usage() {
  printf 'usage: %s --check | --apply\n' "$0" >&2
}

check_host() {
  local failed=0
  local os_name="unsupported"
  local os_version="unknown"
  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    os_name="${ID:-unknown}"
    os_version="${VERSION_ID:-unknown}"
  fi
  printf 'operating system: %s %s\n' "$os_name" "$os_version"
  [[ "$os_name" == "ubuntu" ]] || failed=1

  local architecture
  architecture="$(uname -m)"
  printf 'architecture: %s\n' "$architecture"
  [[ "$architecture" == "aarch64" || "$architecture" == "arm64" ]] \
    || failed=1

  local swap_kib=0
  if [[ -r /proc/swaps ]]; then
    swap_kib="$(awk 'NR > 1 { total += $3 } END { print total + 0 }' /proc/swaps)"
  fi
  printf 'swap: %s KiB (required: %s KiB)\n' "$swap_kib" "$REQUIRED_SWAP_KIB"
  (( swap_kib >= REQUIRED_SWAP_KIB )) || failed=1

  if command -v mongod >/dev/null 2>&1; then
    printf 'mongodb binary: ready\n'
  else
    printf 'mongodb binary: missing\n'
    failed=1
  fi
  if command -v systemctl >/dev/null 2>&1 \
    && systemctl is-active --quiet mongod 2>/dev/null; then
    printf 'mongodb service: ready\n'
  else
    printf 'mongodb service: missing\n'
    failed=1
  fi
  return "$failed"
}

require_supported_host() {
  [[ -r /etc/os-release ]] || {
    printf 'bootstrap error: operating system metadata is unavailable\n' >&2
    exit 1
  }
  # shellcheck disable=SC1091
  . /etc/os-release
  [[ "${ID:-}" == "ubuntu" ]] || {
    printf 'bootstrap error: Ubuntu is required\n' >&2
    exit 1
  }
  case "$(uname -m)" in
    aarch64 | arm64) ;;
    *)
      printf 'bootstrap error: ARM64 architecture is required\n' >&2
      exit 1
      ;;
  esac
}

ensure_swap() {
  local swap_kib
  swap_kib="$(awk 'NR > 1 { total += $3 } END { print total + 0 }' /proc/swaps)"
  (( swap_kib >= REQUIRED_SWAP_KIB )) && return 0
  [[ ! -e /swapfile ]] || {
    printf 'bootstrap error: /swapfile exists but active swap is below 2 GiB\n' >&2
    exit 1
  }
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
}

apply_bootstrap() {
  [[ "${BOOTSTRAP_CONFIRM:-}" == "APPLY_MONGODB_HOST" ]] || {
    printf 'bootstrap error: set BOOTSTRAP_CONFIRM=APPLY_MONGODB_HOST to continue\n' >&2
    exit 2
  }
  (( EUID == 0 )) || {
    printf 'bootstrap error: --apply must run as root\n' >&2
    exit 1
  }
  require_supported_host
  apt-get update
  apt-get install --yes ca-certificates curl gnupg
  curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc \
    | gpg --dearmor --yes -o /usr/share/keyrings/mongodb-server-8.0.gpg
  local codename="${UBUNTU_CODENAME:-$VERSION_CODENAME}"
  printf '%s\n' \
    "deb [ arch=arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu $codename/mongodb-org/8.0 multiverse" \
    > /etc/apt/sources.list.d/mongodb-org-8.0.list
  apt-get update
  apt-get install --yes mongodb-org
  ensure_swap
  systemctl enable --now mongod
  printf '%s\n' \
    'MongoDB base installation completed' \
    'configure private bind address, authentication, databases, and users manually'
}

case "${1:-}" in
  --check) check_host ;;
  --apply) apply_bootstrap ;;
  *)
    usage
    exit 2
    ;;
esac
