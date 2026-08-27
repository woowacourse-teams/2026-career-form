FROM eclipse-temurin:21-jre-noble AS extract
WORKDIR /builder

COPY build/libs/*.jar application.jar

RUN java -Djarmode=tools -jar application.jar \
    extract --layers --destination extracted

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

USER careerform:careerform

EXPOSE 8080

CMD ["java", "-jar", "application.jar"]
