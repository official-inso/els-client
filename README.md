# @inso_web/els-client

[![npm version](https://img.shields.io/npm/v/@inso_web/els-client.svg)](https://www.npmjs.com/package/@inso_web/els-client)
[![npm downloads](https://img.shields.io/npm/dm/@inso_web/els-client.svg)](https://www.npmjs.com/package/@inso_web/els-client)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@inso_web/els-client)](https://bundlephobia.com/package/@inso_web/els-client)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![license MIT](https://img.shields.io/npm/l/@inso_web/els-client.svg)](./LICENSE)

Лёгкий TypeScript-клиент для **Error Logs Service (ELS)** — SaaS-сервиса централизованного сбора, поиска и аналитики ошибок и событий приложений. Собирает, батчит и отправляет логи из браузера и Node.js — **без транзитивных зависимостей**.

> **Pino-совместимый API** (`info` / `warn` / `error` / `debug` / `fatal` / `child`) — drop-in замена Pino, Winston, pino-loki без отдельного transport-пакета.

---

## Содержание

- [Что такое ELS](#что-такое-els)
- [UI: что вы получаете](#ui-что-вы-получаете)
- [Установка](#установка)
- [Quick Start](#quick-start)
- [Использование как логгер (Pino-compatible)](#использование-как-логгер-pino-compatible)
- [Миграция с Pino / Winston / Loki](#миграция-с-pino--winston--loki)
- [Версионирование (`appVersion`)](#версионирование-appversion)
- [Конфигурация (ELSConfig)](#конфигурация-elsconfig)
- [API](#api)
- [Использование в браузере и Node.js](#использование-в-браузере-и-nodejs)
- [Advanced](#advanced)
- [FAQ](#faq)
- [Пакеты-обёртки](#пакеты-обёртки)

---

## Что такое ELS

ELS — это сервис централизованного логирования. Он:

- **Принимает** ошибки и события из любых приложений по HTTPS (батчами или по одному).
- **Хранит** их в PostgreSQL с индексами для быстрого поиска.
- **Группирует** одинаковые ошибки по fingerprint (нормализованное сообщение + первая строка stack).
- **Анализирует** через встроенный AI: даёт человекочитаемую диагностику (что произошло, где, как чинить) и обзор всей выборки.
- **Коррелирует** события: показывает что происходило **до** и **после** ошибки в той же сессии — для отладки причин.
- **Отслеживает регрессии** по версиям: какие ошибки появились впервые в свежей версии приложения, а какие наоборот перестали возникать.
- **Защищает** через API-ключи: scoped ключи (write / read / read-any), live/test environments, IP-whitelist, ротация.

Этот клиент — тонкий sender. Один пакет, ноль зависимостей, ~3 KB gzip.

---

## UI: что вы получаете

ELS из коробки даёт админ-панель. Скриншоты ниже показывают что вы увидите после интеграции этого SDK.

### Список логов с фильтрами и поиском

![Список логов](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/01-error-logs-list.png)

Виртуальная таблица всех событий: trace ID, приложение, источник (client/server), уровень (critical / error / warning / info / debug), сообщение, страница, IP. Слева — fully-faceted сайдбар с фильтрами по приложению, окружению, **версии**, источнику, уровню, браузеру, языку, IP, категории ошибки, fingerprint'у. Сверху быстрые пресеты и Live-mode (auto-refresh каждые 5с).

### Детальная карточка события

![Детальная карточка](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/02-event-detail-info.png)

Полные метаданные события: время сервера и клиента, IP с гео, язык, окружение, **версия приложения**, fingerprint, session ID. Карточки повторений (час / сутки / неделя). Справа — корреляция: что происходило в той же сессии и совпадающие события у других пользователей.

### Ошибка с AI-диагностикой

![Ошибка с AI](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/03-error-detail-ai.png)

Stack trace с распарсенными фреймами. Справа — AI-анализ: что именно сломалось, где (файл / строка), почему и как чинить. Корреляция показывает связанные ошибки в когорте.

### Аналитика и регрессии по версиям

![Аналитика](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/04-analytics-dashboard.png)

Дашборд: общее число событий, критические + ошибки, предупреждения, доля ошибок. AI-обзор слева пишет естественным языком что не так и куда смотреть. Хронология (timeline) с возможностью сравнения с предыдущим периодом. Donut'ы по приложению, источнику, уровню. Тепловая карта по часам/дням, топ URL, топ IP. И главное для нас — **виджет «Регрессии»**: какие fingerprint'ы появились впервые в самой свежей версии и какие пропали.

### Управление API-ключами

![API ключи](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/05-api-keys.png)

Список ключей по приложениям и сервисам. Префикс ключа, окружение (live / test), уровень доступа (write / read / read-any), даты создания и последнего использования. Цветовая индикация активных ключей.

![Действия с ключом](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/06-api-key-actions.png)

Контекстное меню ключа: ротация (генерация нового rawKey, старый продолжает работать ~1 минуту), удаление, копирование префикса.

### Избранные события

![Избранные](https://raw.githubusercontent.com/official-inso/els-go/main/docs/screenshots/07-favorites.png)

Закладки на конкретные trace ID — для расследований. Открываются в одном клике, не теряются между сессиями.

---

## Установка

```bash
npm install @inso_web/els-client
# или
pnpm add @inso_web/els-client
# или
yarn add @inso_web/els-client
```

Требования: Node.js 18+ или браузер с глобальным `fetch`.

---

## Quick Start

```ts
import { ELSClient } from '@inso_web/els-client';

// Один экземпляр на всё приложение
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

Готово. Каждый `log.*(...)` отправит структурированное событие в ELS — fire-and-forget, без блокировок и без шанса уронить ваше приложение.

---

## Использование как логгер (Pino-compatible)

`ELSClient` реализует Pino-совместимый интерфейс `Logger`. Это значит, что вы можете использовать его как обычный логгер с привычным API — без отдельной библиотеки.

```ts
// Контекстные child-логгеры
const reqLog = log.child({ requestId: 'r1', userId: 42 });
reqLog.info('processing');
reqLog.error(err, 'failed');
```

**Поведение**:
- Методы fire-and-forget. Не возвращают Promise, не throw, не ломают приложение.
- Сетевые ошибки тихо логируются в `console.error`, ваш код не падает.
- Уровни ниже `minLevel` отбрасываются без отправки.

**Маппинг уровней на ELS `level`**:

| Метод SDK | ELS level |
|---|---|
| `fatal` | `critical` |
| `error` | `error` |
| `warn` | `warning` |
| `info` | `info` |
| `debug` | `debug` |
| `trace` | `debug` |

---

## Миграция с Pino / Winston / Loki

Переход с других логгеров — в одну строку. API совпадает.

### Pino → @inso_web/els-client

```diff
- import pino from 'pino';
- const log = pino({ level: 'info' });
+ import { ELSClient } from '@inso_web/els-client';
+ const log = new ELSClient({ endpoint, apiKey, appSlug, minLevel: 'info' });
// log.info(), log.warn(), log.error(), log.child() — API совпадает
```

### Winston → @inso_web/els-client

```diff
- import winston from 'winston';
- const log = winston.createLogger({ level: 'info', transports: [...] });
+ import { ELSClient } from '@inso_web/els-client';
+ const log = new ELSClient({ endpoint, apiKey, appSlug, minLevel: 'info' });
```

### pino-loki → @inso_web/els-client

```diff
- import pino from 'pino';
- const log = pino({ ... }, pinoLoki({ host: 'loki.local' }));
+ import { ELSClient } from '@inso_web/els-client';
+ const log = new ELSClient({ endpoint: 'https://api.insoweb.ru/els', ... });
```

Концептуально то же: положили лог → он улетел в централизованное хранилище. Без дополнительных пакетов-транспортов и с zero dependencies.

---

## Версионирование (`appVersion`)

Поле `appVersion` помогает аналитике ELS отвечать на вопрос **«с какой версии появилась эта ошибка»** и видеть **регрессии** в свежем релизе.

```ts
new ELSClient({
  // ...
  appVersion: process.env.BUILD_VERSION, // или import.meta.env.VITE_BUILD_VERSION в Vite
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

Аналитика умеет сортировать timeline семантически (внутри одного формата) и через `min(receivedAt) per version` (когда в выборке смешаны форматы).

**Рекомендация**: ставить в Dockerfile/CI `BUILD_VERSION=$(date -u +%Y%m%d%H%M%S)` — лексикографически = хронологически, всегда уникально, легко читается человеком.

---

## Конфигурация (ELSConfig)

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
| `minLevel` | `LogLevel` | `'info'` | Минимальный уровень логов для отправки |
| `loggerDefaults` | `Record<string, unknown>` | `{}` | Базовые поля для всех логов |

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

## Использование в браузере и Node.js

### Браузер (window error handlers)

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

### Node.js (process-level handlers)

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

---

## Advanced

- **Идемпотентность**: каждому событию клиент присваивает `traceId` (UUID v4), если не задан вручную. Повторные события с тем же `traceId` сервер считает дубликатами.
- **`Retry-After`**: при 429 клиент уважает заголовок `Retry-After` (секунды), иначе использует линейный бэкофф.
- **sendBeacon**: `ELSQueue` на `pagehide` использует `navigator.sendBeacon`, чтобы доставить буфер даже при закрытии вкладки.
- **Silent fail**: клиент не бросает сетевых ошибок наружу — только логирует в `console.error`.
- **Маленький бандл**: ~3 KB gzip, никаких runtime-зависимостей.

---

## FAQ

**Чем отличается от Sentry?** Меньший бандл, нулевые зависимости, минимальный API. Подходит когда нужен лёгкий error reporter без overhead'а тяжёлого SDK + AI-аналитика на стороне сервера.

**Как использовать в React/Vue/Next.js/NestJS?** Берите специализированные обёртки:
- [`@inso_web/els-react`](https://www.npmjs.com/package/@inso_web/els-react)
- [`@inso_web/els-vue`](https://www.npmjs.com/package/@inso_web/els-vue)
- [`@inso_web/els-next`](https://www.npmjs.com/package/@inso_web/els-next)
- [`@inso_web/els-nest`](https://www.npmjs.com/package/@inso_web/els-nest)
- [`@inso_web/els-express`](https://www.npmjs.com/package/@inso_web/els-express)

**Работает в edge/workers?** Да — используется только глобальный `fetch`.

**Что если ELS недоступен?** SDK не бросает наружу, не блокирует приложение. Сетевые ошибки и 5xx уходят в `console.error`, событие теряется (fire-and-forget). Для надёжной доставки используйте `ELSQueue` с `useBeacon: true` в браузере.

---

## Сравнение с альтернативами

|  | `@inso_web/els-client` | Sentry SaaS | LogRocket |
|---|---|---|---|
| Размер бандла | ~3 KB | ~70 KB | ~50 KB |
| Zero deps | Да | Нет | Нет |
| TypeScript strict | Да | Да | Частично |
| Минималистичный API | Да | Нет | Нет |
| AI-диагностика | Да (на сервере ELS) | Партнёрская | Нет |
| Self-hosted ready | Да | Нет (только SaaS) | Нет |

---

## Пакеты-обёртки

- [`@inso_web/els-express`](https://www.npmjs.com/package/@inso_web/els-express) — Express middleware с `req.log` и error handler. Drop-in замена `pino-http`.
- [`@inso_web/els-nest`](https://www.npmjs.com/package/@inso_web/els-nest) — NestJS module, `LoggerService`, DI. Drop-in замена встроенного `Logger`.
- [`@inso_web/els-next`](https://www.npmjs.com/package/@inso_web/els-next) — Next.js helpers для App Router и Pages Router, edge runtime support.
- [`@inso_web/els-react`](https://www.npmjs.com/package/@inso_web/els-react) — Provider, hooks, `<ErrorBoundary>` для React 17+.
- [`@inso_web/els-vue`](https://www.npmjs.com/package/@inso_web/els-vue) — plugin и composable для Vue 3.

---

## Examples

Runnable примеры в [`./examples/`](./examples/):

- `node-basic` — Node.js простой sender
- `node-batch` — batch + queue с graceful shutdown
- `browser-vanilla` — HTML через esm.sh CDN

---

## License

[MIT](./LICENSE) © INSOWEB
