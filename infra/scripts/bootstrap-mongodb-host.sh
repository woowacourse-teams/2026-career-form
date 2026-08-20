#!/usr/bin/env bash
set -euo pipefail

MONGODB_DATA_DIR="${MONGODB_DATA_DIR:-/var/lib/career-form/mongodb}"
MONGODB_CONFIG_DIR="${MONGODB_CONFIG_DIR:-/etc/career-form}"
MONGODB_COMPOSE_DIR="${MONGODB_COMPOSE_DIR:-/opt/career-form/mongodb}"
DOCKER_KEYRING_DIR="${DOCKER_KEYRING_DIR:-/etc/apt/keyrings}"
APT_SOURCES_DIR="${APT_SOURCES_DIR:-/etc/apt/sources.list.d}"
OS_RELEASE_FILE="${OS_RELEASE_FILE:-/etc/os-release}"

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

check_directory() {
  local label="$1"
  local directory="$2"
  if [[ -d "$directory" ]]; then
    printf '%s: ready\n' "$label"
  else
    mark_missing "$label"
  fi
}

check_host() {
  CHECK_FAILED=0
  local os_name="unsupported"
  local os_version="unknown"
  if [[ -r "$OS_RELEASE_FILE" ]]; then
    # shellcheck disable=SC1090
    . "$OS_RELEASE_FILE"
    os_name="${ID:-unknown}"
    os_version="${VERSION_ID:-unknown}"
  fi
  printf 'operating system: %s %s\n' "$os_name" "$os_version"
  [[ "$os_name" == "ubuntu" && "$os_version" == "24.04" ]] \
    || CHECK_FAILED=1

  local architecture
  architecture="$(uname -m)"
  printf 'architecture: %s\n' "$architecture"
  [[ "$architecture" == "aarch64" || "$architecture" == "arm64" ]] \
    || CHECK_FAILED=1

  check_command "docker" docker
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    printf 'compose: ready\n'
  else
    mark_missing "compose"
  fi
  check_directory "mongodb data directory" "$MONGODB_DATA_DIR"
  check_directory "mongodb config directory" "$MONGODB_CONFIG_DIR"
  check_directory "mongodb compose directory" "$MONGODB_COMPOSE_DIR"

  return "$CHECK_FAILED"
}

require_supported_host() {
  [[ -r "$OS_RELEASE_FILE" ]] || {
    printf 'bootstrap error: operating system metadata is unavailable\n' >&2
    exit 1
  }
  # shellcheck disable=SC1090
  . "$OS_RELEASE_FILE"
  [[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" == "24.04" ]] || {
    printf 'bootstrap error: Ubuntu 24.04 is required\n' >&2
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

install_docker_repository() {
  install -m 0755 -d "$DOCKER_KEYRING_DIR" "$APT_SOURCES_DIR"
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o "$DOCKER_KEYRING_DIR/docker.asc"
  chmod a+r "$DOCKER_KEYRING_DIR/docker.asc"
  local codename="${UBUNTU_CODENAME:-$VERSION_CODENAME}"
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

install_mongodb_host_packages() {
  apt-get install --yes \
    ca-certificates \
    containerd.io \
    curl \
    docker-buildx-plugin \
    docker-ce \
    docker-ce-cli \
    docker-compose-plugin \
    gnupg
}

prepare_mongodb_directories() {
  install -d -m 0700 "$MONGODB_DATA_DIR" "$MONGODB_CONFIG_DIR"
  install -d -m 0755 "$MONGODB_COMPOSE_DIR"
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
  install_docker_repository
  apt-get update
  install_mongodb_host_packages
  prepare_mongodb_directories
  systemctl enable --now docker
  printf '%s\n' \
    'MongoDB Docker host base installation completed' \
    'create the protected environment file and start the reviewed Compose project manually'
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
