FROM eclipse-temurin:21-jdk-noble AS build
WORKDIR /workspace

COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle ./gradle
COPY src ./src

RUN --mount=type=cache,target=/root/.gradle \
    ./gradlew bootJar --no-daemon

FROM eclipse-temurin:21-jre-noble AS extract
WORKDIR /builder

COPY --from=build /workspace/build/libs/*.jar application.jar

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
