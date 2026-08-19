#!/usr/bin/env bash
set -euo pipefail

readonly REQUIRED_SWAP_KIB=2097152
readonly SWAP_METADATA_TOLERANCE_KIB=16
SWAPS_FILE="${SWAPS_FILE:-/proc/swaps}"
DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-/var/lib/career-form/deploy}"
DEPLOY_RUNNER_GROUP="${DEPLOY_RUNNER_GROUP:-docker}"
CLOUDFLARED_KEYRING_DIR="${CLOUDFLARED_KEYRING_DIR:-/usr/share/keyrings}"
APT_SOURCES_DIR="${APT_SOURCES_DIR:-/etc/apt/sources.list.d}"

usage() {
  printf 'usage: %s --check | --apply\n' "$0" >&2
}

mark_missing() {
  printf '%s: missing\n' "$1"
  CHECK_FAILED=1
}

check_command() {
  local label="$1"
  local command="$2"
  if command -v "$command" >/dev/null 2>&1; then
    printf '%s: ready\n' "$label"
  else
    mark_missing "$label"
  fi
}

read_swap_kib() {
  [[ -r "$SWAPS_FILE" ]] \
    && awk 'NR > 1 { total += $3 } END { print total + 0 }' "$SWAPS_FILE" \
    || printf '0\n'
}

swap_capacity_sufficient() {
  local swap_kib="$1"
  (( swap_kib + SWAP_METADATA_TOLERANCE_KIB >= REQUIRED_SWAP_KIB ))
}

check_swap() {
  local swap_kib
  swap_kib="$(read_swap_kib)"
  printf 'swap: %s KiB (required: %s KiB)\n' "$swap_kib" "$REQUIRED_SWAP_KIB"
  swap_capacity_sufficient "$swap_kib"
}

check_host() {
  CHECK_FAILED=0
  local os_name="unsupported"
  local os_version="unknown"
  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    os_name="${ID:-unknown}"
    os_version="${VERSION_ID:-unknown}"
  fi
  printf 'operating system: %s %s\n' "$os_name" "$os_version"
  [[ "$os_name" == "ubuntu" ]] || CHECK_FAILED=1

  local architecture
  architecture="$(uname -m)"
  printf 'architecture: %s\n' "$architecture"
  [[ "$architecture" == "aarch64" || "$architecture" == "arm64" ]] \
    || CHECK_FAILED=1

  check_swap || CHECK_FAILED=1

  check_command "docker" docker
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    printf 'compose: ready\n'
  else
    mark_missing "compose"
  fi
  check_command "nginx" nginx
  check_command "certbot" certbot
  check_command "cloudflared" cloudflared
  check_command "curl" curl
  check_command "jq" jq
  check_command "git" git

  if command -v systemctl >/dev/null 2>&1 \
    && systemctl list-unit-files 'actions.runner.*.service' --no-legend 2>/dev/null \
      | grep -q 'actions.runner.'; then
    printf 'github actions runner: ready\n'
  else
    mark_missing "github actions runner"
  fi

  return "$CHECK_FAILED"
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
  swap_kib="$(read_swap_kib)"
  swap_capacity_sufficient "$swap_kib" && return 0
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

install_docker_repository() {
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  local codename="${UBUNTU_CODENAME:-$VERSION_CODENAME}"
  local architecture
  architecture="$(dpkg --print-architecture)"
  printf '%s\n' \
    'Types: deb' \
    'URIs: https://download.docker.com/linux/ubuntu' \
    "Suites: $codename" \
    'Components: stable' \
    "Architectures: $architecture" \
    'Signed-By: /etc/apt/keyrings/docker.asc' \
    > /etc/apt/sources.list.d/docker.sources
}

install_cloudflared_repository() {
  install -m 0755 -d "$CLOUDFLARED_KEYRING_DIR" "$APT_SOURCES_DIR"
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
    -o "$CLOUDFLARED_KEYRING_DIR/cloudflare-main.gpg"
  printf '%s\n' \
    "deb [signed-by=$CLOUDFLARED_KEYRING_DIR/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
    > "$APT_SOURCES_DIR/cloudflared.list"
}

install_application_packages() {
  apt-get install --yes \
    ca-certificates \
    certbot \
    curl \
    git \
    gnupg \
    jq \
    nginx \
    python3-certbot-nginx
}

prepare_deploy_state_directory() {
  install -d \
    -m 0770 \
    -g "$DEPLOY_RUNNER_GROUP" \
    "$DEPLOY_STATE_DIR"
}

apply_bootstrap() {
  [[ "${BOOTSTRAP_CONFIRM:-}" == "APPLY_APP_HOST" ]] || {
    printf 'bootstrap error: set BOOTSTRAP_CONFIRM=APPLY_APP_HOST to continue\n' >&2
    exit 2
  }
  (( EUID == 0 )) || {
    printf 'bootstrap error: --apply must run as root\n' >&2
    exit 1
  }
  require_supported_host
  apt-get update
  install_application_packages
  install_docker_repository
  install_cloudflared_repository
  apt-get update
  apt-get install --yes \
    cloudflared \
    containerd.io \
    docker-buildx-plugin \
    docker-ce \
    docker-ce-cli \
    docker-compose-plugin
  ensure_swap
  prepare_deploy_state_directory
  systemctl enable --now docker nginx
  printf '%s\n' \
    'application host base installation completed' \
    'configure Nginx HTTPS and the SSH-only cloudflared tunnel manually'
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  case "${1:-}" in
    --check) check_host ;;
    --apply) apply_bootstrap ;;
    *)
      usage
      exit 2
      ;;
  esac
fi
