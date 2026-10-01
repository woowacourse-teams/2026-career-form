#!/usr/bin/env bash
set -euo pipefail

MONGODB_COMPOSE_FILE="${MONGODB_COMPOSE_FILE:-/opt/career-form/mongodb/compose.yaml}"
MONGODB_ENV_FILE="${MONGODB_ENV_FILE:-/etc/career-form/mongodb.env}"
MONGODB_DATA_DIR="${MONGODB_DATA_DIR:-/var/lib/career-form/mongodb}"
MONGODB_PROJECT_NAME="${MONGODB_PROJECT_NAME:-career-form-mongodb}"

usage() {
  printf 'usage: %s --check | --pull | --up | --status | --shell\n' "$0" >&2
}

is_private_ipv4() {
  local address="$1"
  local first second third fourth extra
  IFS=. read -r first second third fourth extra <<< "$address"
  [[ -z "${extra:-}" ]] || return 1
  for octet in "$first" "$second" "$third" "$fourth"; do
    [[ "$octet" =~ ^[0-9]{1,3}$ ]] || return 1
    (( 10#$octet <= 255 )) || return 1
  done
  (( 10#$first == 10 )) && return 0
  (( 10#$first == 172 && 10#$second >= 16 && 10#$second <= 31 )) && return 0
  (( 10#$first == 192 && 10#$second == 168 )) && return 0
  return 1
}

require_runtime_contract() {
  [[ -n "${MONGODB_BIND_IP:-}" ]] && is_private_ipv4 "$MONGODB_BIND_IP" || {
    printf 'mongodb compose error: MONGODB_BIND_IP must be an RFC1918 private IPv4 address\n' >&2
    exit 1
  }
  [[ -f "$MONGODB_COMPOSE_FILE" ]] || {
    printf 'mongodb compose error: compose file is missing\n' >&2
    exit 1
  }
  [[ -f "$MONGODB_ENV_FILE" ]] || {
    printf 'mongodb compose error: protected environment file is missing\n' >&2
    exit 1
  }
  local mode
  mode="$(stat -c '%a' "$MONGODB_ENV_FILE" 2>/dev/null \
    || stat -f '%Lp' "$MONGODB_ENV_FILE")"
  [[ "$mode" == "600" ]] || {
    printf 'mongodb compose error: protected environment file mode must be 600\n' >&2
    exit 1
  }
  export MONGODB_BIND_IP MONGODB_ENV_FILE MONGODB_DATA_DIR
}

run_compose() {
  docker compose \
    --project-name "$MONGODB_PROJECT_NAME" \
    -f "$MONGODB_COMPOSE_FILE" \
    "$@"
}

require_runtime_contract

case "${1:-}" in
  --check)
    run_compose config --quiet
    ;;
  --pull)
    run_compose config --quiet
    run_compose pull
    ;;
  --up)
    run_compose config --quiet
    run_compose up --detach --wait
    ;;
  --status)
    run_compose ps
    ;;
  --shell)
    run_compose exec mongodb \
      mongosh --host 127.0.0.1 --authenticationDatabase admin \
      --username career_form_admin --password
    ;;
  *)
    usage
    exit 2
    ;;
esac
