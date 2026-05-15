# @inso_web/els-client

[![npm version](https://img.shields.io/npm/v/@inso_web/els-client.svg)](https://www.npmjs.com/package/@inso_web/els-client)
[![npm downloads](https://img.shields.io/npm/dm/@inso_web/els-client.svg)](https://www.npmjs.com/package/@inso_web/els-client)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@inso_web/els-client)](https://bundlephobia.com/package/@inso_web/els-client)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![license MIT](https://img.shields.io/npm/l/@inso_web/els-client.svg)](./LICENSE)

Лёгкий TypeScript-клиент для **Inso Error Logs Service (ELS)** — управляемого SaaS централизованного сбора ошибок и событий с AI-диагностикой. Батчит и шлёт события из Node.js и браузера с **нулевыми runtime-зависимостями**.

> **Pino-совместимый API** (`info` / `warn` / `error` / `debug` / `fatal` / `child`) — drop-in замена Pino, Winston, Loki-транспортов без дополнительного пакета.

> 🇬🇧 [English version → README.md](README.md) &nbsp;•&nbsp; 📚 [Обзор всех SDK → ../README_RU.md](../README_RU.md)

---

## Содержание

- [Что вы получаете](#что-вы-получаете)
- [Установка](#установка)
- [Быстрый старт](#быстрый-старт)
- [Использование как логгер (Pino-compatible)](#использование-как-логгер-pino-compatible)
- [Браузер и Node — паттерны](#браузер-и-node--паттерны)
- [Когда client vs queue](#когда-client-vs-queue)
- [Ключевые концепции](#ключевые-концепции)
- [Конфигурация](#конфигурация)
- [Миграция](#миграция)
  - [С Pino](#с-pino)
  - [С Winston](#с-winston)
  - [С Bunyan](#с-bunyan)
  - [С console.log](#с-consolelog)
  - [С @sentry/node](#с-sentrynode)
  - [С pino-loki](#с-pino-loki)
- [Версионирование (`appVersion`)](#версионирование-appversion)
- [API](#api)
- [Quick reference](#quick-reference)
- [Почему ELS](#почему-els)
- [Примеры](#примеры)
- [Другие ELS SDK](#другие-els-sdk)
- [Тарифы](#тарифы)
- [Лицензия](#лицензия)

---

## Что вы получаете

Каждое отправленное событие попадает во встроенную панель с полнотекстовым поиском, фасетной фильтрацией, AI-диагностикой и виджетом регрессий по версиям.

![Превью панели ELS](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/01-error-logs-list.png)

→ **[Полный обзор UI с 4 скриншотами](../README_RU.md#что-вы-получаете)**

---

## Установка

```bash
npm install @inso_web/els-client
# или
pnpm add @inso_web/els-client
# или
yarn add @inso_web/els-client
```

**Требования:** Node.js 18+ или любой браузер с глобальным `fetch`.

---

## Быстрый старт

```ts
import { ELSClient } from '@inso_web/els-client';

// Один экземпляр на приложение
export const log = new ELSClient({
  endpoint: 'https://api.insoweb.ru/els',
  apiKey: process.env.ELS_API_KEY!,
  appSlug: 'my-app',
  serviceName: 'api',
  deploymentEnv: 'PRODUCTION',
  appVersion: process.env.BUILD_VERSION,    // см. секцию «Версионирование»
  minLevel: 'info',
});

log.info('Server started on port 3000');
log.warn({ userId: 42 }, 'High request rate');
log.error(err, 'Database query failed');
```

Каждый вызов `log.*(...)` отправит структурированное событие в ELS — fire-and-forget, без блокировок, без шансов уронить ваше приложение.

Ещё нет API-ключа? **[Зарегистрируйтесь на lk.insoweb.ru](https://lk.insoweb.ru)** — займёт минуту.

---

## Использование как логгер (Pino-compatible)

`ELSClient` реализует Pino-совместимый интерфейс `Logger`. Используйте его как обычный логгер — без отдельной библиотеки.

```ts
// Контекстные child-логгеры
const reqLog = log.child({ requestId: 'r1', userId: 42 });
reqLog.info('processing');
reqLog.error(err, 'failed');
```

**Поведение:**

- Методы fire-and-forget. Не возвращают Promise, не throw, не ломают приложение.
- Сетевые ошибки уходят в `console.error`, ваш код продолжает работать.
- Уровни ниже `minLevel` отбрасываются до отправки.

**Маппинг уровней на ELS `level`:**

| Метод SDK | ELS level |
|---|---|
| `fatal` | `critical` |
| `error` | `error` |
| `warn` | `warning` |
| `info` | `info` |
| `debug` | `debug` |
| `trace` | `debug` |

---

## Браузер и Node — паттерны

### Браузер: глобальные обработчики ошибок

```ts
import { ELSClient, ELSQueue } from '@inso_web/els-client';

const client = new ELSClient({ /* ... */ });
const queue = new ELSQueue(client, {
  flushIntervalMs: 5_000,
  maxBatchSize: 20,
  useBeacon: true, // авто-flush на pagehide через sendBeacon
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

### Edge runtime / Workers

Работает «из коробки» — клиент использует только глобальный `fetch`, никаких Node-only API.

---

## Когда client vs queue

| Сценарий | Что брать |
|---|---|
| Один Node-сервис, ресурсов достаточно, минимум движущихся частей | `ELSClient` напрямую — `log.info(...)`, `log.error(...)` |
| Браузер, нужно пережить unload | `ELSClient` + `ELSQueue` с `useBeacon: true` |
| Всплески трафика в Node, нужно коалесцировать | `ELSClient` + `ELSQueue` с `maxBatchSize > 1` |
| Нужно подтверждение доставки | `await client.sendError(entry)` (низкоуровневый путь) |
| Много child-контекстов (per request, per user) | `log.child({ ...bindings })` |

`ELSClient` и `ELSQueue` используют один wire-формат.

---

## Ключевые концепции

### Fire-and-forget vs подтверждение доставки

Высокоуровневые методы (`log.info`, `log.error`, …) не блокируют. Они не throw'ят и не возвращают Promise, который надо `await`-ить. Для критичных путей с подтверждением:

```ts
try {
  await client.sendError({ message: 'payment failed', level: 'critical', /* ... */ });
} catch (e) {
  // сеть / 5xx / 429 — безопасно ретраить из вызывающего кода
}
```

### Bindings и child-логгеры

```ts
const tenantLog = log.child({ tenant: 'acme', region: 'eu-west-1' });
tenantLog.info('worker started');
// На сервере приходит meta: { tenant: 'acme', region: 'eu-west-1' }
```

Дочерние логгеры дешёвые — создавайте один на запрос, на job, на сессию.

### Silent fail

Клиент никогда не ронит host-приложение. При транспортной ошибке пишет в `console.error` и теряет событие (fire-and-forget). Если нужна устойчивость к падениям — `ELSQueue` + `useBeacon: true` в браузере или `process.on('beforeExit', () => client.flush())` в Node.

---

## Конфигурация

| Опция | Тип | По умолчанию | Описание |
|---|---|---|---|
| `endpoint` | `string` | — | URL инстанса ELS (обязательно) |
| `apiKey` | `string` | — | API-ключ приложения (обязательно) |
| `appSlug` | `string` | — | Slug приложения (обязательно) |
| `deploymentEnv` | `'DEV' \| 'STAGING' \| 'PRODUCTION'` | `'DEV'` | Окружение |
| `serviceName` | `string` | — | Имя сервиса/модуля внутри приложения |
| `appVersion` | `string` | — | Версия приложения (любой формат, ≤128 символов) |
| `timeout` | `number` | `10000` | Таймаут HTTP-запроса в мс |
| `retries` | `number` | `3` | Число ретраев при сетевых ошибках и 429 |
| `authHeader` | `'bearer' \| 'x-api-key'` | `'bearer'` | Формат передачи ключа |
| `minLevel` | `LogLevel` | `'info'` | Минимальный уровень для отправки |
| `loggerDefaults` | `Record<string, unknown>` | `{}` | Базовые поля для всех логов |

---

## Миграция

### С Pino

API совпадает: `info / warn / error / debug / fatal / child` — переход одной строкой на файл.

**Было:**

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

**Стало:**

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

| Pino | ELS | Заметки |
|---|---|---|
| `pino({ level: 'info' })` | `new ELSClient({ minLevel: 'info' })` | Тот же порядок приоритетов |
| `log.info(obj, msg)` | `log.info(obj, msg)` | Идентичная сигнатура |
| `log.child(bindings)` | `log.child(bindings)` | Bindings уходят в `meta` |
| `pino.transport({ target: 'pino-loki' })` | не нужен | HTTP-транспорт встроен |
| Pretty-print | оставить `console.log` в dev | ELS — удалённый sink, не TTY |

**Подводные камни:**

- ELS шлёт в сеть; pretty-output Pino аналога не имеет. Локально оставляйте `console.log`.
- `pino.multistream` не маппится — захват в ELS и `console.log` делайте раздельно.
- Стандартный `serializers` не поддерживается — преобразуйте объекты в коде или через `BeforeSend`.

---

### С Winston

**Было:**

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

**Стало:**

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

| Winston | ELS | Заметки |
|---|---|---|
| `winston.createLogger({ level })` | `new ELSClient({ minLevel })` | То же |
| `defaultMeta` | `loggerDefaults` | Мерджится в каждое событие |
| `transports: [...]` | встроенный HTTP-транспорт | Одна цель, без плагинов |
| `winston.format.json()` | всегда JSON на проводе | Формат не настраивается |
| `child(bindings)` | `child(bindings)` | Идентично |

**Подводные камни:**

- Winston принимает `(message, meta)` — ELS следует Pino: `(meta, message)`. Поменяйте порядок аргументов в местах вызова.
- Консольный вывод не мультиплексится автоматически — держите `console.log` рядом, если он нужен.
- `winston-daily-rotate-file` аналога не имеет — это серверная часть ELS.

---

### С Bunyan

**Было:**

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

**Стало:**

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

| Bunyan | ELS | Заметки |
|---|---|---|
| `bunyan.createLogger({ name })` | `new ELSClient({ appSlug, serviceName })` | `name` ≈ `serviceName` |
| `level: 'info'` | `minLevel: 'info'` | Те же значения |
| `streams: [...]` | не нужны | HTTP-транспорт встроен |
| `child(bindings)` | `child(bindings)` | Идентично |

**Подводные камни:**

- CLI `bunyan` для pretty-print JSON-файлов не применим — события живут в панели ELS.
- Кастомные `serializers` (`serializers.req`, `serializers.err`) аналога не имеют — преобразуйте объекты до вызова или через `BeforeSend`.

---

### С console.log

**Было:**

```ts
console.log('User logged in', userId);
console.warn('Rate limit close', { current, limit });
console.error('Payment failed', err);
```

**Стало:**

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

| `console` | ELS | Заметки |
|---|---|---|
| `console.log` / `info` | `log.info` | |
| `console.warn` | `log.warn` | |
| `console.error` | `log.error` | Первый аргумент — `Error` или `string` |
| `console.debug` | `log.debug` | Ниже дефолтного `minLevel: 'info'` — поднимите чтобы увидеть |

**Подводные камни:**

- Позиционное форматирование (`'%s %d'`) не поддерживается. Используйте структурированные поля (`{ userId, count }`).
- Оставляйте `console.*` для локального dev / временных дебагов; удалённые события — через клиент.

---

### С @sentry/node

**Было:**

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

**Стало:**

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

| Sentry | ELS | Заметки |
|---|---|---|
| `dsn` | `endpoint` + `apiKey` + `appSlug` | DSN разбит на три явных поля |
| `environment` | `deploymentEnv` | То же, фиксированный enum |
| `release` | `appVersion` | Любая строка ≤128 символов |
| `captureException(err)` | `client.error(err)` | |
| `captureMessage(msg, level)` | `client.<level>(msg)` | Метод под каждый уровень |
| `setUser({ id, email })` | `client.child({ user: { id, email } })` | Или через `loggerDefaults` |
| `beforeSend` | `BeforeSend` (на `ELSQueue`) | Та же роль |
| Source maps upload | не предоставляется | Если критично — оставляйте Sentry рядом |
| Performance / tracing | не предоставляется | ELS — про логи, не APM |

**Подводные камни:**

- ELS не делает symbolication через source maps. Шлите читаемые стеки (сохраняйте имена через бандлер) или комбинируйте с другим инструментом.
- Концепта breadcrumbs нет — используйте child-логгеры per request, чтобы переносить контекст.
- Sentry-`scope` push/pop ложится на эфемерные `child`-логгеры.

---

### С pino-loki

**Было:**

```ts
import pino from 'pino';
import { pinoLoki } from 'pino-loki';

const log = pino({
  level: 'info',
}, pinoLoki({ host: 'http://loki.internal:3100' }));
```

**Стало:**

```ts
import { ELSClient } from '@inso_web/els-client';
const log = new ELSClient({
  endpoint: 'https://api.insoweb.ru/els',
  apiKey: process.env.ELS_API_KEY!,
  appSlug: 'my-app',
  minLevel: 'info',
});
```

| pino-loki | ELS | Заметки |
|---|---|---|
| Loki labels | `appSlug`, `serviceName`, `deploymentEnv`, поля в `meta` | Всё это доступно в фильтрах панели |
| `host` | `endpoint` | Плюс auth-заголовок |
| Опции батчинга | встроены (`ELSQueue`) | Дефолты разумные, можно тюнить |

**Подводные камни:**

- Loki чувствителен к cardinality labels; ELS — нет. Можно класть высоко-кардинальные ID пользователей в `meta` без оглядки.
- LogQL аналога не имеет — в ELS фасетный UI и полнотекстовый поиск по `message`, ключам `meta`.

---

## Версионирование (`appVersion`)

Поле `appVersion` помогает аналитике ELS отвечать на «с какой версии появилась эта ошибка» и видеть **регрессии** в свежем релизе.

```ts
new ELSClient({
  // ...
  appVersion: process.env.BUILD_VERSION, // или import.meta.env.VITE_BUILD_VERSION
});
```

ELS принимает **любую строку до 128 символов** и автоматически распознаёт формат:

| Тип | Примеры |
|---|---|
| `date-compact` | `20260507120000` |
| `semver` | `1.2.3`, `1.0.0-rc.1`, `2.0.0+build.123` |
| `calver` | `2026.05`, `26.05.07`, `2026.5.7` |
| `date-iso` | `2026-05-07`, `2026-05-07T12:00:00Z` |
| `git-sha` | `a1b2c3d`, `a1b2c3d4e5f6...` |
| `prefixed` | `v1.2.3`, `release-2026.05`, `main-a1b2c3d` |
| `opaque` | `production`, `nightly`, `customLabel` |

Аналитика сортирует timeline семантически внутри одного формата и через `min(receivedAt) per version`, если выборка мешает форматы.

**Рекомендация** — в CI `BUILD_VERSION=$(date -u +%Y%m%d%H%M%S)`. Лексикографически = хронологически, всегда уникально, читается человеком.

---

## API

```ts
class ELSClient implements Logger {
  constructor(config: ELSConfig);

  // Высокоуровневые (Pino-compatible)
  fatal(obj: object | string | Error, msg?: string, ...args: unknown[]): void;
  error(obj: object | string | Error, msg?: string, ...args: unknown[]): void;
  warn(obj: object | string, msg?: string, ...args: unknown[]): void;
  info(obj: object | string, msg?: string, ...args: unknown[]): void;
  debug(obj: object | string, msg?: string, ...args: unknown[]): void;
  trace(obj: object | string, msg?: string, ...args: unknown[]): void;
  child(bindings: Record<string, unknown>): Logger;
  flush(): Promise<void>;

  // Низкоуровневые
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

Типы `ErrorEntry`, `ErrorLevel`, `ErrorSource`, `DeploymentEnv`, `BatchResult`, `QueueOptions` экспортируются.

---

## Quick reference

| Нужно | Делайте |
|---|---|
| Быстрый Node-захват | `new ELSClient({ endpoint, apiKey, appSlug })` |
| Браузер с устойчивостью к unload | `ELSClient` + `ELSQueue({ useBeacon: true })` |
| Burst-трафик в Node | `ELSClient` + `ELSQueue({ maxBatchSize: 50 })` |
| Per-request bindings | `log.child({ requestId, userId })` |
| Подтверждение доставки | `await client.sendError(entry)` |
| Подавить шумные уровни | `minLevel: 'warn'` |
| Маскировать PII до отправки | `ELSQueue({ beforeSend: e => mask(e) })` |
| Health-проба | `await client.health()` |
| Graceful shutdown в Node | `process.on('beforeExit', () => client.flush())` |

---

## Почему ELS

ELS для Node.js — сфокусированный SaaS для логирования, а не observability-комбайн. Оптимизация под скорость захвата, AI-диагностику и дешевизну интеграции.

- **Меньше веса.** ~3 KB gzip в браузере, один пакет без зависимостей на Node — без транзитивных deps.
- **Ноль внешних API.** Только `POST /errors[/batch]` и `GET /health`. Без трекеров и манифестов.
- **AI-диагностика** на каждом stack trace, из коробки — без аддонов и дополнительной настройки.
- **5 минут интеграции.** Install → API-ключ → готово. Тот же wire-формат — для `.NET`, `JVM`, `Go`, когда вы расширитесь.
- **Прозрачные тарифы.** Цены — в личном кабинете, не в per-event таблице.

| Возможность | ELS | Sentry | Datadog | Loki | LogRocket |
|---|---|---|---|---|---|
| AI на stack-trace | Встроено | Платный аддон | Платный аддон | Нет | Нет |
| Zero-dep SDK | Да | Нет | Нет | Нет | Нет |
| Free-tier retention | 24ч | 30д (лимит) | Только триал | Self-cost | 3–30д |
| Время setup | ~5 мин | 10–20 мин | 30–60 мин | Часы | 10–20 мин |

ELS **не предоставляет**: full APM / tracing, source-map upload, session replay, frontend RUM, метрики инфраструктуры. Если что-то из этого критично — оставьте Sentry или подключите Grafana / Datadog рядом.

→ **Регистрация на [lk.insoweb.ru](https://lk.insoweb.ru)** для API-ключа.

---

## Примеры

Готовые примеры в [`./examples/`](./examples/):

- `node-basic` — минимальный Node-sender
- `node-batch` — batch + queue с graceful shutdown
- `browser-vanilla` — HTML с CDN esm.sh

---

## Другие ELS SDK

Тот же wire-формат, та же панель — выбирайте по стеку.

**Node.js**
- [`@inso_web/els-client`](../js/README_RU.md) — базовый TS / Node / browser клиент (этот пакет)
- [`@inso_web/els-express`](../express/README_RU.md) — Express middleware
- [`@inso_web/els-next`](../next/README_RU.md) — хелперы для Next.js (App + Pages router)
- [`@inso_web/els-nest`](../nest/README_RU.md) — NestJS module
- [`@inso_web/els-react`](../react/README_RU.md) — React Provider, hooks, ErrorBoundary
- [`@inso_web/els-vue`](../vue/README_RU.md) — Vue 3 plugin

**Другие стеки**
- [`Inso.Els`](../csharp/README_RU.md) — .NET (Core + ASP.NET Core + ILogger)
- [`io.github.official-inso:els-core`](../java/README_RU.md) — Java + Spring Boot starter + SLF4J
- [`github.com/official-inso/els-go`](../els-go/README_RU.md) — Go

→ **Обзор и сравнение:** [../README_RU.md](../README_RU.md) · [github.com/official-inso/els-go/blob/main/sdks/README_RU.md](https://github.com/official-inso/els-go/blob/main/sdks/README_RU.md)

---

## Тарифы

Free-тариф — **хранение логов 24 часа**. Полный прайс на **[lk.insoweb.ru](https://lk.insoweb.ru)**.

---

## Лицензия

[MIT](./LICENSE) © INSOWEB
