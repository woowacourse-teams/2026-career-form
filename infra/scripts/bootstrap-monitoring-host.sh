#!/usr/bin/env bash
set -euo pipefail

OS_RELEASE_FILE="${OS_RELEASE_FILE:-/etc/os-release}"
DOCKER_KEYRING_DIR="${DOCKER_KEYRING_DIR:-/etc/apt/keyrings}"
APT_SOURCES_DIR="${APT_SOURCES_DIR:-/etc/apt/sources.list.d}"
MONITORING_DATA_DIR="${MONITORING_DATA_DIR:-/srv/career-form-monitoring}"
MONITORING_CONFIG_DIR="${MONITORING_CONFIG_DIR:-/etc/career-form-monitoring}"
MONITORING_COMPOSE_DIR="${MONITORING_COMPOSE_DIR:-/opt/career-form/monitoring}"

usage() {
  printf 'usage: %s --check | --apply\n' "$0" >&2
}

require_supported_host() {
  if [[ ! -r "$OS_RELEASE_FILE" ]]; then
    printf 'bootstrap error: operating system metadata is unavailable\n' >&2
    return 1
  fi
  . "$OS_RELEASE_FILE"
  if [[ "${ID:-}" != "ubuntu" || ( "${VERSION_ID:-}" != "24.04" && "${VERSION_ID:-}" != "26.04" ) ]]; then
    printf 'bootstrap error: Ubuntu 24.04 or 26.04 is required\n' >&2
    return 1
  fi
  case "$(uname -m)" in
    aarch64 | arm64) ;;
    *)
      printf 'bootstrap error: ARM64 architecture is required\n' >&2
      return 1
      ;;
  esac
}

require_no_conflicting_packages() {
  local package installed_status
  for package in docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker containerd runc; do
    installed_status="$(dpkg-query -W -f='${db:Status-Status}' "$package" 2>/dev/null || true)"
    if [[ "$installed_status" == "installed" ]]; then
      printf 'bootstrap error: conflicting package %s is installed; review it manually before continuing\n' "$package" >&2
      return 1
    fi
  done
}

install_docker_repository() {
  install -m 0755 -d "$DOCKER_KEYRING_DIR" "$APT_SOURCES_DIR"
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o "$DOCKER_KEYRING_DIR/docker.asc"
  chmod a+r "$DOCKER_KEYRING_DIR/docker.asc"
  local codename="${UBUNTU_CODENAME:-${VERSION_CODENAME:?Ubuntu codename is required}}"
  local architecture
  architecture="$(dpkg --print-architecture)"
  printf '%s\n' \
    'Types: deb' \
    'URIs: https://download.docker.com/linux/ubuntu' \
    "Suites: $codename" \
    'Components: stable' \
    "Architectures: $architecture" \
    "Signed-By: $DOCKER_KEYRING_DIR/docker.asc" \
    > "$APT_SOURCES_DIR/docker.sources"
}

install_monitoring_host_packages() {
  apt-get install --yes \
    containerd.io \
    docker-buildx-plugin \
    docker-ce \
    docker-ce-cli \
    docker-compose-plugin
}

prepare_monitoring_directories() {
  install -d -m 0700 \
    "$MONITORING_DATA_DIR" \
    "$MONITORING_CONFIG_DIR" \
    "$MONITORING_CONFIG_DIR/secrets"
  install -d -m 0755 "$MONITORING_COMPOSE_DIR"
}

check_directory() {
  if [[ -d "$2" ]]; then
    printf '%s: ready\n' "$1"
  else
    printf '%s: missing\n' "$1"
    CHECK_FAILED=1
  fi
}

check_host() {
  CHECK_FAILED=0
  printf 'architecture: %s\n' "$(uname -m)"
  if require_supported_host; then
    printf 'operating system: %s %s, supported\n' "$ID" "$VERSION_ID"
  else
    printf 'operating system or architecture: unsupported\n'
    CHECK_FAILED=1
  fi
  if command -v docker >/dev/null 2>&1; then
    printf 'docker: ready\n'
  else
    printf 'docker: missing\n'
    CHECK_FAILED=1
  fi
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    printf 'compose: ready\n'
  else
    printf 'compose: missing\n'
    CHECK_FAILED=1
  fi
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    printf 'docker daemon: ready\n'
  else
    printf 'docker daemon: missing or inaccessible (run --check with sudo)\n'
    CHECK_FAILED=1
  fi
  check_directory 'monitoring data directory' "$MONITORING_DATA_DIR"
  check_directory 'monitoring config directory' "$MONITORING_CONFIG_DIR"
  check_directory 'monitoring secrets directory' "$MONITORING_CONFIG_DIR/secrets"
  check_directory 'monitoring compose directory' "$MONITORING_COMPOSE_DIR"
  return "$CHECK_FAILED"
}

apply_bootstrap() {
  if [[ "${BOOTSTRAP_CONFIRM:-}" != "APPLY_MONITORING_HOST" ]]; then
    printf 'bootstrap error: set BOOTSTRAP_CONFIRM=APPLY_MONITORING_HOST to continue\n' >&2
    return 2
  fi
  if (( EUID != 0 )); then
    printf 'bootstrap error: --apply must run as root\n' >&2
    return 1
  fi
  require_supported_host
  require_no_conflicting_packages
  apt-get update
  apt-get install --yes ca-certificates curl
  install_docker_repository
  apt-get update
  install_monitoring_host_packages
  prepare_monitoring_directories
  systemctl enable --now docker
  printf '%s\n' \
    'monitoring host base installation completed' \
    'monitoring containers, credentials, swap and network settings were not configured'
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  case "${1:-}" in
    --check) check_host ;;
    --apply) apply_bootstrap ;;
    *) usage; exit 2 ;;
  esac
fi
