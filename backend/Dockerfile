FROM eclipse-temurin:21-jre-noble AS extract
WORKDIR /builder

COPY build/libs/*.jar application.jar

RUN java -Djarmode=tools -jar application.jar \
    extract --layers --destination extracted

FROM eclipse-temurin:21-jre-noble AS agent
WORKDIR /otel
COPY otel/opentelemetry-javaagent.sha256 ./
RUN curl --fail --silent --show-error --location --retry 3 \
    https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.32.0/opentelemetry-javaagent.jar \
    --output opentelemetry-javaagent.jar \
    && sha256sum --check opentelemetry-javaagent.sha256

FROM eclipse-temurin:21-jre-noble AS runtime
WORKDIR /application

RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system careerform \
    && useradd \
        --system \
        --gid careerform \
        --home-dir /application \
        --no-create-home \
        --shell /usr/sbin/nologin \
        careerform

COPY --from=extract --chown=careerform:careerform \
    /builder/extracted/dependencies/ ./
COPY --from=extract --chown=careerform:careerform \
    /builder/extracted/spring-boot-loader/ ./
COPY --from=extract --chown=careerform:careerform \
    /builder/extracted/snapshot-dependencies/ ./
COPY --from=extract --chown=careerform:careerform \
    /builder/extracted/application/ ./

COPY --from=agent --chown=careerform:careerform /otel/opentelemetry-javaagent.jar /otel/
COPY --chown=careerform:careerform otel/agent.properties /otel/agent.properties
COPY --chmod=0555 docker-entrypoint.sh /application/docker-entrypoint.sh

USER careerform:careerform

EXPOSE 8080

ENTRYPOINT ["/application/docker-entrypoint.sh"]

CMD ["java", "-jar", "application.jar"]
