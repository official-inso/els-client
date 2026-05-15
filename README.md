# @inso_web/els-client

[![npm version](https://img.shields.io/npm/v/@inso_web/els-client.svg)](https://www.npmjs.com/package/@inso_web/els-client)
[![npm downloads](https://img.shields.io/npm/dm/@inso_web/els-client.svg)](https://www.npmjs.com/package/@inso_web/els-client)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@inso_web/els-client)](https://bundlephobia.com/package/@inso_web/els-client)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![license MIT](https://img.shields.io/npm/l/@inso_web/els-client.svg)](./LICENSE)

Lightweight TypeScript client for the **Inso Error Logs Service (ELS)** — a managed SaaS for centralised event logging (debug → fatal) with AI-assisted error triage. Batches and ships events from Node.js and the browser with **zero runtime dependencies**.

> **Pino-compatible API** (`info` / `warn` / `error` / `debug` / `fatal` / `child`) — drop-in replacement for Pino, Winston, and Loki transports without an extra package.

> 🇷🇺 [Русская версия → README_RU.md](README_RU.md)

---

## Table of contents

- [What you get](#what-you-get)
- [Install](#install)
- [Quick Start](#quick-start)
- [Use as a logger (Pino-compatible)](#use-as-a-logger-pino-compatible)
- [Browser & Node patterns](#browser--node-patterns)
- [When to use the client vs the queue](#when-to-use-the-client-vs-the-queue)
- [Core concepts](#core-concepts)
- [Configuration](#configuration)
- [Migration](#migration)
  - [From Pino](#from-pino)
  - [From Winston](#from-winston)
  - [From Bunyan](#from-bunyan)
  - [From console.log](#from-consolelog)
  - [From @sentry/node](#from-sentrynode)
  - [From pino-loki](#from-pino-loki)
- [Versioning (`appVersion`)](#versioning-appversion)
- [API](#api)
- [Quick reference](#quick-reference)
- [Why ELS](#why-els)
- [Examples](#examples)
- [Other ELS SDKs](#other-els-sdks)
- [Pricing](#pricing)
- [License](#license)

---

## What you get

ELS ships with a built-in admin dashboard. Every event captured by this SDK lands there with full-text search, faceted filtering, AI-assisted diagnosis, and version-aware regression detection.

| | |
|---|---|
| ![Logs list](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/01-error-logs-list.png) | ![Event detail](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/02-event-detail-info.png) |
| Virtual table with facet sidebar (app, env, **version**, source, level, browser, IP, category). Live mode auto-refreshes every 5s. | Full event metadata: timestamps, geo, env, **app version**, fingerprint, session, repetition cards, in-session correlation. |
| ![AI diagnosis](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/03-error-detail-ai.png) | ![Analytics](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/04-analytics-dashboard.png) |
| Parsed stack trace + AI-assisted diagnosis: what broke, where, how to fix. | Timeline, donuts, top URLs/IPs, hourly heatmap, **version-regression widget**. |

---

## Install

```bash
npm install @inso_web/els-client
# or
pnpm add @inso_web/els-client
# or
yarn add @inso_web/els-client
```

**Requirements:** Node.js 18+ or any browser with a global `fetch`.

---

## Quick Start

```ts
import { ELSClient } from '@inso_web/els-client';

// One instance per app
export const log = new ELSClient({
  endpoint: 'https://api.insoweb.ru/els',
  apiKey: process.env.ELS_API_KEY!,
  appSlug: 'my-app',
  serviceName: 'api',
  deploymentEnv: 'PRODUCTION',
  appVersion: process.env.BUILD_VERSION,    // see "Versioning"
  minLevel: 'info',
});

log.info('Server started on port 3000');
log.warn({ userId: 42 }, 'High request rate');
log.error(err, 'Database query failed');
```

Each `log.*(...)` call ships a structured event to ELS — fire-and-forget, non-blocking, never throws.

Don't have an API key yet? **[Sign up at lk.insoweb.ru](https://lk.insoweb.ru)** — takes under a minute.

---

## Use as a logger (Pino-compatible)

`ELSClient` implements a Pino-compatible `Logger` interface. Use it as a regular logger — no extra library.

```ts
// Context-bound child loggers
const reqLog = log.child({ requestId: 'r1', userId: 42 });
reqLog.info('processing');
reqLog.error(err, 'failed');
```

**Behaviour:**

- Methods are fire-and-forget. They do not return a Promise, do not throw, and never break the host app.
- Transport errors are logged to `console.error`. Your code keeps running.
- Anything below `minLevel` is dropped before send.

**Level mapping to ELS `level`:**

| SDK method | ELS level |
|---|---|
| `fatal` | `critical` |
| `error` | `error` |
| `warn` | `warning` |
| `info` | `info` |
| `debug` | `debug` |
| `trace` | `debug` |

---

## Browser & Node patterns

### Browser: global error handlers

```ts
import { ELSClient, ELSQueue } from '@inso_web/els-client';

const client = new ELSClient({ /* ... */ });
const queue = new ELSQueue(client, {
  flushIntervalMs: 5_000,
  maxBatchSize: 20,
  useBeacon: true, // auto-flush on pagehide via sendBeacon
});

window.addEventListener('error', (e) => {
  queue.enqueue({
    message: e.message,
    url: location.href,
    stack: e.error?.stack,
    level: 'error',
    source: 'client',
  });
});

window.addEventListener('unhandledrejection', (e) => {
  queue.enqueue({
    message: String(e.reason?.message ?? e.reason),
    url: location.href,
    stack: e.reason?.stack,
    level: 'error',
    source: 'client',
  });
});
```

### Node.js: process-level handlers

```ts
process.on('uncaughtException', (err) => {
  void client.sendError({
    message: err.message,
    stack: err.stack,
    url: process.argv[1] ?? 'node',
    level: 'critical',
    source: 'server',
  });
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  void client.sendError({
    message: err.message,
    stack: err.stack,
    url: 'process://unhandledRejection',
    level: 'error',
    source: 'server',
  });
});
```

### Edge runtimes / Workers

Works out of the box — the client only uses the global `fetch`. No Node-only APIs.

---

## When to use the client vs the queue

| Scenario | Use |
|---|---|
| Single Node service, plenty of CPU, want fewest moving parts | `ELSClient` directly — `log.info(...)`, `log.error(...)` |
| Browser, want to survive page unload | `ELSClient` + `ELSQueue` with `useBeacon: true` |
| Bursty traffic in Node, want to coalesce events | `ELSClient` + `ELSQueue` with `maxBatchSize > 1` |
| Need synchronous delivery confirmation | `await client.sendError(entry)` (low-level path) |
| Many child contexts (per request, per user) | `log.child({ ...bindings })` |

Both `ELSClient` and `ELSQueue` route through the same wire format.

---

## Core concepts

### Fire-and-forget vs delivery-confirmed

High-level methods (`log.info`, `log.error`, …) are non-blocking. They never throw and never return a Promise the caller has to `await`. For critical paths where you need confirmation:

```ts
try {
  await client.sendError({ message: 'payment failed', level: 'critical', /* ... */ });
} catch (e) {
  // network / 5xx / 429 — safe to retry from the caller
}
```

### Bindings & child loggers

```ts
const tenantLog = log.child({ tenant: 'acme', region: 'eu-west-1' });
tenantLog.info('worker started');
// Server receives meta: { tenant: 'acme', region: 'eu-west-1' }
```

Children are cheap — create one per request, per job, per session.

### Silent failure

The client never crashes the host. On transport errors it writes to `console.error` and drops the event (fire-and-forget). If you need durability across crashes, use `ELSQueue` with `useBeacon: true` in the browser or sleep on Node-side `process.on('beforeExit', () => client.flush())`.

---

## Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `endpoint` | `string` | — | ELS instance URL (required) |
| `apiKey` | `string` | — | Application API key (required) |
| `appSlug` | `string` | — | Application slug (required) |
| `deploymentEnv` | `'DEV' \| 'STAGING' \| 'PRODUCTION'` | `'DEV'` | Environment marker |
| `serviceName` | `string` | — | Service / module name inside the app |
| `appVersion` | `string` | — | App version (any format, ≤128 chars) |
| `timeout` | `number` | `10000` | HTTP request timeout, ms |
| `retries` | `number` | `3` | Retries on network errors and 429 |
| `authHeader` | `'bearer' \| 'x-api-key'` | `'bearer'` | Key transport header |
| `minLevel` | `LogLevel` | `'info'` | Minimum level to send |
| `loggerDefaults` | `Record<string, unknown>` | `{}` | Default fields injected into every log |

---

## Migration

### From Pino

`@inso_web/els-client` exposes the same `info / warn / error / debug / fatal / child` API surface — switching is one line per file.

**Before:**

```ts
import pino from 'pino';
const log = pino({
  level: 'info',
  transport: { target: 'pino-pretty' },
});

log.info({ userId: 42 }, 'user fetched');
log.error(err, 'query failed');
const reqLog = log.child({ requestId: 'r1' });
```

**After:**

```ts
import { ELSClient } from '@inso_web/els-client';
const log = new ELSClient({
  endpoint: 'https://api.insoweb.ru/els',
  apiKey: process.env.ELS_API_KEY!,
  appSlug: 'my-app',
  minLevel: 'info',
});

log.info({ userId: 42 }, 'user fetched');
log.error(err, 'query failed');
const reqLog = log.child({ requestId: 'r1' });
```

| Pino concept | ELS equivalent | Notes |
|---|---|---|
| `pino({ level: 'info' })` | `new ELSClient({ minLevel: 'info' })` | Same priority ordering |
| `log.info(obj, msg)` | `log.info(obj, msg)` | Identical signature |
| `log.child(bindings)` | `log.child(bindings)` | Bindings merge into `meta` |
| `pino.transport({ target: 'pino-loki' })` | Not needed | Built-in HTTP transport |
| `pretty` printing | Use `console.log` in dev | ELS is a remote sink, not a TTY printer |

**Gotchas:**

- ELS sends to the network; Pino's TTY-pretty output has no equivalent. Keep `console.log` for local dev.
- `pino.multistream` has no direct mapping — capture to ELS and `console.log` separately if you need both.
- The standard `serializers` option is not supported — pre-shape objects in your code or use `BeforeSend`.

---

### From Winston

**Before:**

```ts
import winston from 'winston';
const log = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'api' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.Http({ host: 'logs.example.com', path: '/' }),
  ],
});

log.info('user logged in', { userId: 42 });
log.error('payment failed', { error: err });
```

**After:**

```ts
import { ELSClient } from '@inso_web/els-client';
const log = new ELSClient({
  endpoint: 'https://api.insoweb.ru/els',
  apiKey: process.env.ELS_API_KEY!,
  appSlug: 'my-app',
  serviceName: 'api',
  minLevel: 'info',
  loggerDefaults: { service: 'api' },
});

log.info({ userId: 42 }, 'user logged in');
log.error(err, 'payment failed');
```

| Winston concept | ELS equivalent | Notes |
|---|---|---|
| `winston.createLogger({ level })` | `new ELSClient({ minLevel })` | Same idea |
| `defaultMeta` | `loggerDefaults` | Merged into every event |
| `transports: [...]` | Built-in HTTP transport | One destination, no plugin packages |
| `winston.format.json()` | Always JSON on the wire | Format choice is not exposed |
| `child(bindings)` | `child(bindings)` | Same behaviour |

**Gotchas:**

- Winston accepts positional `(message, meta)`. ELS follows Pino's `(meta, message)`. Re-order arguments at call sites.
- Console output is not multiplexed — keep `console.log` separately if you want both.
- `winston-daily-rotate-file` has no analogue — that role is server-side in ELS.

---

### From Bunyan

**Before:**

```ts
import bunyan from 'bunyan';
const log = bunyan.createLogger({
  name: 'api',
  level: 'info',
  streams: [{ stream: process.stdout }],
});

log.info({ userId: 42 }, 'fetched');
const reqLog = log.child({ reqId: 'r1' });
```

**After:**

```ts
import { ELSClient } from '@inso_web/els-client';
const log = new ELSClient({
  endpoint: 'https://api.insoweb.ru/els',
  apiKey: process.env.ELS_API_KEY!,
  appSlug: 'api',
  minLevel: 'info',
});

log.info({ userId: 42 }, 'fetched');
const reqLog = log.child({ reqId: 'r1' });
```

| Bunyan concept | ELS equivalent | Notes |
|---|---|---|
| `bunyan.createLogger({ name })` | `new ELSClient({ appSlug, serviceName })` | `name` ≈ `serviceName` |
| `level: 'info'` | `minLevel: 'info'` | Same string values |
| `streams: [...]` | Not needed | HTTP transport built-in |
| `child(bindings)` | `child(bindings)` | Identical |

**Gotchas:**

- Bunyan's `bunyan` CLI for pretty-printing JSON files does not apply — events live in the ELS dashboard.
- Custom serializers (`serializers.req`, `serializers.err`) have no direct option — shape objects before logging, or use `BeforeSend`.

---

### From console.log

**Before:**

```ts
console.log('User logged in', userId);
console.warn('Rate limit close', { current, limit });
console.error('Payment failed', err);
```

**After:**

```ts
import { ELSClient } from '@inso_web/els-client';
const log = new ELSClient({
  endpoint: 'https://api.insoweb.ru/els',
  apiKey: process.env.ELS_API_KEY!,
  appSlug: 'my-app',
});

log.info({ userId }, 'User logged in');
log.warn({ current, limit }, 'Rate limit close');
log.error(err, 'Payment failed');
```

| `console` method | ELS method | Notes |
|---|---|---|
| `console.log` / `info` | `log.info` | |
| `console.warn` | `log.warn` | |
| `console.error` | `log.error` | First arg can be `Error` or `string` |
| `console.debug` | `log.debug` | Below default `minLevel: 'info'` — bump to capture |

**Gotchas:**

- Variadic positional formatting (`'%s %d'`) is not supported. Convert to structured fields (`{ userId, count }`).
- Keep `console.*` for local dev / ephemeral debug; remote events should go via the client.

---

### From @sentry/node

**Before:**

```ts
import * as Sentry from '@sentry/node';
Sentry.init({
  dsn: 'https://public@sentry.example.com/1',
  environment: 'production',
  release: process.env.BUILD_VERSION,
});

Sentry.captureException(err);
Sentry.captureMessage('payment timeout', 'warning');
Sentry.setUser({ id: '42', email: 'a@b.com' });
```

**After:**

```ts
import { ELSClient } from '@inso_web/els-client';
const client = new ELSClient({
  endpoint: 'https://api.insoweb.ru/els',
  apiKey: process.env.ELS_API_KEY!,
  appSlug: 'my-app',
  deploymentEnv: 'PRODUCTION',
  appVersion: process.env.BUILD_VERSION,
});

client.error(err);
client.warn('payment timeout');
client.child({ user: { id: '42', email: 'a@b.com' } });
```

| Sentry concept | ELS equivalent | Notes |
|---|---|---|
| `dsn` | `endpoint` + `apiKey` + `appSlug` | DSN is split into three explicit fields |
| `environment` | `deploymentEnv` | Same idea, fixed enum |
| `release` | `appVersion` | Any string ≤128 chars |
| `captureException(err)` | `client.error(err)` | |
| `captureMessage(msg, level)` | `client.<level>(msg)` | Pick a method per level |
| `setUser({ id, email })` | `client.child({ user: { id, email } })` | Or pass via `loggerDefaults` |
| `beforeSend` | `BeforeSend` (on `ELSQueue`) | Same role |
| Source maps upload | Not provided | If critical — keep Sentry alongside |
| Performance / tracing | Not provided | ELS focuses on logging, not APM |

**Gotchas:**

- ELS does not symbolicate via source maps. Ship readable stacks (preserve names through bundlers) or pair with another tool.
- Breadcrumbs have no direct concept — use child loggers per request to carry context.
- Sentry's `scope` push/pop pattern maps to ephemeral `child` loggers.

---

### From pino-loki

**Before:**

```ts
import pino from 'pino';
import { pinoLoki } from 'pino-loki';

const log = pino({
  level: 'info',
}, pinoLoki({ host: 'http://loki.internal:3100' }));
```

**After:**

```ts
import { ELSClient } from '@inso_web/els-client';
const log = new ELSClient({
  endpoint: 'https://api.insoweb.ru/els',
  apiKey: process.env.ELS_API_KEY!,
  appSlug: 'my-app',
  minLevel: 'info',
});
```

| pino-loki concept | ELS equivalent | Notes |
|---|---|---|
| Loki labels | `appSlug`, `serviceName`, `deploymentEnv`, fields in `meta` | All of the above are queryable in the dashboard |
| `host` | `endpoint` | Plus auth header |
| Batching options | Built-in (`ELSQueue`) | Defaults are sane; tune if needed |

**Gotchas:**

- Loki is label-cardinality-sensitive; ELS is not — you can put high-cardinality user IDs in `meta` freely.
- LogQL has no equivalent — ELS uses a faceted UI with full-text search over `message`, `meta` keys.

---

## Versioning (`appVersion`)

The `appVersion` field powers ELS analytics for **regression detection** — “which errors first appeared in the latest release.”

```ts
new ELSClient({
  // ...
  appVersion: process.env.BUILD_VERSION, // or import.meta.env.VITE_BUILD_VERSION
});
```

ELS accepts **any string up to 128 characters** and auto-detects the format:

| Type | Examples |
|---|---|
| `date-compact` | `20260507120000` |
| `semver` | `1.2.3`, `1.0.0-rc.1`, `2.0.0+build.123` |
| `calver` | `2026.05`, `26.05.07`, `2026.5.7` |
| `date-iso` | `2026-05-07`, `2026-05-07T12:00:00Z` |
| `git-sha` | `a1b2c3d`, `a1b2c3d4e5f6...` |
| `prefixed` | `v1.2.3`, `release-2026.05`, `main-a1b2c3d` |
| `opaque` | `production`, `nightly`, `customLabel` |

The analytics layer sorts timelines semantically within one format and falls back to `min(receivedAt) per version` when the dataset mixes formats.

**Recommended setup** — set `BUILD_VERSION=$(date -u +%Y%m%d%H%M%S)` in CI. Lexicographic = chronological, always unique, readable.

---

## API

```ts
class ELSClient implements Logger {
  constructor(config: ELSConfig);

  // High-level (Pino-compatible)
  fatal(obj: object | string | Error, msg?: string, ...args: unknown[]): void;
  error(obj: object | string | Error, msg?: string, ...args: unknown[]): void;
  warn(obj: object | string, msg?: string, ...args: unknown[]): void;
  info(obj: object | string, msg?: string, ...args: unknown[]): void;
  debug(obj: object | string, msg?: string, ...args: unknown[]): void;
  trace(obj: object | string, msg?: string, ...args: unknown[]): void;
  child(bindings: Record<string, unknown>): Logger;
  flush(): Promise<void>;

  // Low-level
  sendError(entry: ErrorEntry): Promise<void>;
  sendBatch(entries: ErrorEntry[]): Promise<BatchResult | null>;
}

class ELSQueue {
  constructor(client: ELSClient, opts?: QueueOptions);
  enqueue(entry: ErrorEntry): void;
  flush(): Promise<void>;
  stop(): void;
}
```

Types `ErrorEntry`, `ErrorLevel`, `ErrorSource`, `DeploymentEnv`, `BatchResult`, `QueueOptions` are exported.

---

## Quick reference

| Need | Use |
|---|---|
| Quick Node capture | `new ELSClient({ endpoint, apiKey, appSlug })` |
| Browser with page-unload safety | `ELSClient` + `ELSQueue({ useBeacon: true })` |
| Bursty Node service | `ELSClient` + `ELSQueue({ maxBatchSize: 50 })` |
| Per-request bindings | `log.child({ requestId, userId })` |
| Delivery confirmation | `await client.sendError(entry)` |
| Suppress noisy levels | `minLevel: 'warn'` |
| Mask PII before send | `ELSQueue({ beforeSend: e => mask(e) })` |
| Health probe | `await client.health()` |
| Graceful Node shutdown | `process.on('beforeExit', () => client.flush())` |

---

## Why ELS

ELS for Node.js is a focused logging SaaS, not a full observability suite. It optimises for capture speed, AI-driven triage, and a low integration cost.

- **Lower weight.** ~3 KB gzip in the browser, single dependency-free package on Node — no transitive deps.
- **Zero external API calls.** Only `POST /errors[/batch]` and `GET /health`. No trackers, no manifests.
- **AI-assisted diagnosis** on every stack trace, out of the box — no add-ons, no extra setup.
- **5-minute integration.** Install → set API key → done. Same wire format works for `.NET`, `JVM`, `Go` when you expand.
- **Predictable price.** Tariffs live in the dashboard, not in a per-event spreadsheet.

### Detailed comparison

| Category | ELS | Sentry | Datadog / New Relic | Grafana Loki | LogRocket / Logtail / BetterStack |
|---|---|---|---|---|---|
| Hosting model | Managed SaaS | SaaS or self-hosted | SaaS only | Self-hosted / Grafana Cloud | SaaS |
| SDK runtime deps | Zero | Medium (sub-SDKs, integrations) | Heavy (agent + tracing) | Promtail / agent | Medium |
| Typical integration time | ~5 min | 10–20 min | 30–60 min | Hours to days | 10–20 min |
| AI-assisted triage | Built-in | Paid add-on | Paid add-on | None | None |
| Error grouping / fingerprint | Yes | Yes | Yes | Manual via LogQL | Partial |
| Source-map upload | No | Yes | Yes | n/a | Partial |
| Session replay (frontend) | No | Paid | Paid | n/a | Yes (core) |
| Distributed tracing / APM | No | Partial | Yes (core) | Yes with Tempo | No |
| Infrastructure metrics | No | No | Yes (core) | Yes with Mimir | No |
| Free tier log retention | 24 hours | 30 days (limited volume) | Trial only | Self-cost | 3–30 days |
| Russian-language support / docs | Native | Community | Limited | Community | None |

### When ELS is the wrong choice

- You need a single vendor for **APM + logs + metrics** under one bill — go Datadog or New Relic.
- Your frontend bug triage relies on **DOM session replay** — go LogRocket or Sentry Replay.
- You ship a **public mobile app** and need crash symbolication + ANR detection — Firebase Crashlytics or Sentry Mobile.

For everything else — backend errors, frontend JS errors, request logs, structured app events with version-aware analytics — ELS is built to be the cheapest path to a working dashboard.

→ **Sign up at [lk.insoweb.ru](https://lk.insoweb.ru)** to grab an API key.

---

## Examples

Runnable samples in [`./examples/`](./examples/):

- `node-basic` — minimal Node sender
- `node-batch` — batch + queue with graceful shutdown
- `browser-vanilla` — esm.sh CDN HTML page

---

## Other ELS SDKs

Same wire format, same dashboard — pick by stack.

**Node.js family**
- [`@inso_web/els-client`](https://github.com/official-inso/els-client) — base TS / Node / browser client (this repo)
- [`@inso_web/els-express`](https://github.com/official-inso/els-express) — Express middleware
- [`@inso_web/els-next`](https://github.com/official-inso/els-next) — Next.js helpers (App + Pages router)
- [`@inso_web/els-nest`](https://github.com/official-inso/els-nest) — NestJS module
- [`@inso_web/els-react`](https://github.com/official-inso/els-react) — React Provider, hooks, ErrorBoundary
- [`@inso_web/els-vue`](https://github.com/official-inso/els-vue) — Vue 3 plugin

**Other stacks**
- [`Inso.Els`](https://github.com/official-inso/els-csharp) — .NET (Core + ASP.NET Core + ILogger)
- [`io.github.official-inso:els-core`](https://github.com/official-inso/els-java) — Java + Spring Boot starter + SLF4J
- [`github.com/official-inso/els-go`](https://github.com/official-inso/els-go) — Go

---

## Pricing

Free tier — **24-hour log retention**. See **[lk.insoweb.ru](https://lk.insoweb.ru)** for the full tariff matrix.

---

## License

[MIT](./LICENSE) © INSOWEB
