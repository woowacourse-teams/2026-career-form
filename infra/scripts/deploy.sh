#!/usr/bin/env bash
set -euo pipefail

umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

: "${DEPLOY_ENVIRONMENT:?DEPLOY_ENVIRONMENT is required}"
: "${BACKEND_IMAGE:?BACKEND_IMAGE is required}"
: "${BACKEND_PORT:?BACKEND_PORT is required}"
: "${SPRING_PROFILES_ACTIVE:?SPRING_PROFILES_ACTIVE is required}"
: "${SPRING_MONGODB_URI:?SPRING_MONGODB_URI is required}"

DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-/var/lib/career-form/deploy}"
READINESS_ATTEMPTS="${READINESS_ATTEMPTS:-24}"
READINESS_INTERVAL_SECONDS="${READINESS_INTERVAL_SECONDS:-5}"

fail() {
  printf 'deploy error: %s\n' "$1" >&2
  exit 1
}

if [[ ! "$BACKEND_IMAGE" =~ ^([A-Za-z0-9][A-Za-z0-9._:/-]*)@sha256:[0-9a-f]{64}$ ]]; then
  fail "BACKEND_IMAGE must use repository@sha256:<64 lowercase hex> digest format"
fi
IMAGE_REPOSITORY="${BASH_REMATCH[1]}"

case "$DEPLOY_ENVIRONMENT:$SPRING_PROFILES_ACTIVE" in
  development:dev | staging:staging | production:prod) ;;
  *) fail "deployment environment and Spring profile do not match" ;;
esac

if [[ ! "$BACKEND_PORT" =~ ^[0-9]+$ ]] \
  || (( BACKEND_PORT < 1024 || BACKEND_PORT > 65535 )); then
  fail "BACKEND_PORT must be between 1024 and 65535"
fi

if [[ ! "$READINESS_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
  fail "READINESS_ATTEMPTS must be a positive integer"
fi
if [[ ! "$READINESS_INTERVAL_SECONDS" =~ ^[0-9]+$ ]]; then
  fail "READINESS_INTERVAL_SECONDS must be a non-negative integer"
fi

ENVIRONMENT_STATE_DIR="$DEPLOY_STATE_DIR/$DEPLOY_ENVIRONMENT"
CURRENT_DIGEST_FILE="$ENVIRONMENT_STATE_DIR/current-digest"
PREVIOUS_DIGEST_FILE="$ENVIRONMENT_STATE_DIR/previous-digest"
COMPOSE_PROJECT="career-form-$DEPLOY_ENVIRONMENT"
COMPOSE_FILES=(
  --project-directory "$ROOT_DIR"
  --project-name "$COMPOSE_PROJECT"
  -f "$ROOT_DIR/compose.yaml"
  -f "$ROOT_DIR/infra/compose.deploy.yaml"
)

mkdir -p -- "$ENVIRONMENT_STATE_DIR"

read_digest() {
  local path="$1"
  if [[ -f "$path" ]]; then
    IFS= read -r REPLY < "$path" || true
    printf '%s' "$REPLY"
  fi
}

write_digest() {
  local path="$1"
  local value="$2"
  local temporary="$path.tmp.$$"
  printf '%s\n' "$value" > "$temporary"
  mv -f -- "$temporary" "$path"
}

wait_until_ready() {
  local attempt
  for ((attempt = 1; attempt <= READINESS_ATTEMPTS; attempt += 1)); do
    if curl \
      --fail \
      --silent \
      --show-error \
      "http://127.0.0.1:$BACKEND_PORT/actuator/health" \
      >/dev/null; then
      return 0
    fi
    if (( attempt < READINESS_ATTEMPTS )); then
      sleep "$READINESS_INTERVAL_SECONDS"
    fi
  done
  return 1
}

deploy_image() {
  local image="$1"

  docker pull "$image" || return 1
  BACKEND_IMAGE="$image" docker compose "${COMPOSE_FILES[@]}" config --quiet \
    || return 1
  BACKEND_IMAGE="$image" docker compose "${COMPOSE_FILES[@]}" \
    up --detach --no-build backend || return 1
  wait_until_ready
}

cleanup_stale_images() {
  local current="$1"
  local previous="$2"
  local local_image
  local image_list

  image_list="$(
    docker image ls \
      --digests \
      --format '{{.Repository}}@{{.Digest}}' \
      "$IMAGE_REPOSITORY" 2>/dev/null || true
  )"
  printf '%s\n' "$image_list" | while IFS= read -r local_image; do
    [[ -n "$local_image" ]] || continue
    [[ "$local_image" == "$IMAGE_REPOSITORY@sha256:"* ]] || continue
    [[ "$local_image" == "$current" ]] && continue
    [[ -n "$previous" && "$local_image" == "$previous" ]] && continue
    docker image rm "$local_image" || true
  done
}

current_digest="$(read_digest "$CURRENT_DIGEST_FILE")"

if deploy_image "$BACKEND_IMAGE"; then
  if [[ -n "$current_digest" && "$current_digest" != "$BACKEND_IMAGE" ]]; then
    write_digest "$PREVIOUS_DIGEST_FILE" "$current_digest"
  fi
  write_digest "$CURRENT_DIGEST_FILE" "$BACKEND_IMAGE"
  previous_digest="$(read_digest "$PREVIOUS_DIGEST_FILE")"
  cleanup_stale_images "$BACKEND_IMAGE" "$previous_digest"
  printf 'deployment succeeded: %s\n' "$DEPLOY_ENVIRONMENT"
  exit 0
fi

printf 'deploy error: readiness or container replacement failed\n' >&2
if [[ -z "$current_digest" ]]; then
  printf 'deploy error: no previous digest is available for rollback\n' >&2
  exit 1
fi

if deploy_image "$current_digest"; then
  printf 'deploy error: rollback succeeded; original deployment remains failed\n' >&2
else
  printf 'deploy error: rollback failed; manual recovery is required\n' >&2
fi
exit 1
