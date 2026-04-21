# Observability Stack

This project can run Grafana LGTM and GlitchTip alongside the existing Docker Compose stack with:

```bash
docker compose \
  --env-file .env \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.prod.yml \
  -f docker/docker-compose.observability.yml \
  up -d
```

For local development, replace `docker/docker-compose.prod.yml` with `docker/docker-compose.dev.yml`.

## Services

- Grafana: `http://localhost:3000`
- Loki API: `http://localhost:3100`
- Tempo API: `http://localhost:3200`
- OTLP gRPC: `http://localhost:4317`
- OTLP HTTP: `http://localhost:4318`
- GlitchTip: `http://localhost:8080`

## Docker Loki Logging Driver

The Compose override uses Docker's Loki logging driver for container logs. Install it on the Docker host before starting the stack:

```bash
docker plugin install grafana/loki-docker-driver:latest --alias loki --grant-all-permissions
```

If you do not want to use the Docker logging driver, remove the `logging:` blocks from `docker/docker-compose.observability.yml` and ship logs with Promtail instead.

## Laravel Logs

Laravel is configured to:

- keep file logs in `storage/logs`
- emit structured JSON logs to `stderr`
- let Docker ship container logs to Loki

Recommended production env values:

```env
LOG_CHANNEL=stack
LOG_STACK=single,stderr_json
AUTH_LOG_STACK=auth_daily,stderr_json
AUTH_LOG_LEVEL=info
```

## Traces To Tempo

The Compose override exposes the OTLP collector endpoint through the `lgtm` container. The app env is already set to send traces to:

```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://lgtm:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_TRACES_EXPORTER=otlp
```

To actually emit Laravel traces, install a Laravel OpenTelemetry package. The most pragmatic option here is:

```bash
composer require keepsuit/laravel-opentelemetry
php artisan vendor:publish --provider="Keepsuit\\LaravelOpenTelemetry\\LaravelOpenTelemetryServiceProvider" --tag="opentelemetry-config"
```

That package instruments HTTP requests, DB queries, queues, Redis, and can include authenticated user context in traces.

## GlitchTip

GlitchTip is Sentry-compatible. Point your backend and frontend SDKs at the GlitchTip DSN:

```env
GLITCHTIP_DSN=http://<public-key>@glitchtip-web:8000/<project-id>
GLITCHTIP_ENVIRONMENT=production
GLITCHTIP_RELEASE=<git-sha>
```

Recommended Laravel package:

```bash
composer require sentry/sentry-laravel
php artisan sentry:publish --dsn="${GLITCHTIP_DSN}"
```

For React, use `@sentry/react` with the same DSN.

## Auth Tracking

Use Telescope for local debugging, not as your production auth audit trail.

Recommended split:

- Telescope: local and staging request inspection
- Loki: structured auth success/failure/logout/password-reset audit events
- GlitchTip: auth-related exceptions only

If you want production auth tracking, add dedicated listeners for Laravel auth events and log them to the `auth` channel.
