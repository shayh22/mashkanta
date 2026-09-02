# Multi-stage build: the fat JAR is assembled with the full JDK and toolchain, then copied into a
# JRE-only runtime so the shipped image carries no compiler, no Maven cache and no source.
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Dependencies are resolved in their own layer so a source-only change does not re-download them.
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q -DskipTests package

FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app

# The application never needs to write to its own filesystem, so it runs as an unprivileged user.
RUN addgroup -S mashkanta && adduser -S mashkanta -G mashkanta
COPY --from=build /build/target/*.jar app.jar
USER mashkanta

EXPOSE 8080

# Container-aware heap sizing: the JVM reads the cgroup limit rather than the host's memory.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:+UseG1GC"

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:8080/actuator/health | grep -q UP || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
