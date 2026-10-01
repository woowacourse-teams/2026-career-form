#!/bin/sh

select_python() {
  repository_root=$1
  if [ -f "$repository_root/.venv/bin/python" ]; then
    printf '%s\n' "$repository_root/.venv/bin/python"
  elif command -v python3 >/dev/null 2>&1; then
    command -v python3
  else
    command -v python
  fi
}
