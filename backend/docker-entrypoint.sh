#!/bin/sh
set -eu
case "${CAREER_FORM_OTEL_ENABLED:-false}" in
  true)
    : "${OTEL_EXPORTER_OTLP_ENDPOINT:?OTLP endpoint is required when tracing is enabled}"
    export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:+$JAVA_TOOL_OPTIONS }-javaagent:/otel/opentelemetry-javaagent.jar"
    export OTEL_JAVAAGENT_CONFIGURATION_FILE=/otel/agent.properties
    ;;
  false) ;;
  *) printf 'CAREER_FORM_OTEL_ENABLED must be true or false\n' >&2; exit 2 ;;
esac
exec "$@"
