export type ErrorLevel = "critical" | "error" | "warning" | "info" | "debug";
export type ErrorSource = "client" | "server";
export type DeploymentEnv = "DEV" | "STAGING" | "PRODUCTION";
export type AuthHeader = "bearer" | "x-api-key";

export interface ErrorEntry {
  traceId?: string;
  message: string;
  url: string;
  timestamp?: string;
  stack?: string;
  componentStack?: string;
  userAgent?: string;
  language?: string;
  screenSize?: string;
  viewportSize?: string;
  referrer?: string;
  level?: ErrorLevel;
  source?: ErrorSource;
  browser?: string;
  errorCategory?: string;
  appSlug?: string;
  serviceName?: string;
  deploymentEnv?: DeploymentEnv;
  fingerprint?: string;
  sessionId?: string;
  /**
   * Версия приложения (BUILD_VERSION / VITE_BUILD_VERSION / NEXT_PUBLIC_BUILD_VERSION
   * или произвольная строка). ELS принимает любой формат до 128 символов.
   * Если не указано на entry — берётся из ELSConfig.appVersion.
   */
  appVersion?: string;
}

export interface ELSConfig {
  endpoint: string;
  apiKey: string;
  appSlug: string;
  deploymentEnv?: DeploymentEnv;
  serviceName?: string;
  /**
   * Версия приложения, общая для всех логов клиента. Любая строка до 128
   * символов: semver («1.2.3»), CalVer («2026.05.07»), date-compact
   * («20260507120000»), git SHA, prefixed («v1.2.3», «release-…»), opaque.
   * ELS аналитика автоматически распознаёт тип и упорядочивает версии в
   * timeline. Рекомендуется передавать `process.env.BUILD_VERSION`,
   * прокинутый Dockerfile-ом из CI (`date -u +%Y%m%d%H%M%S`).
   */
  appVersion?: string;
  timeout?: number;
  retries?: number;
  authHeader?: AuthHeader;
  /** Минимальный уровень логов которые отправляются (default 'info') */
  minLevel?: LogLevel;
  /** Биндинги, которые добавляются ко всем log-вызовам по умолчанию */
  loggerDefaults?: Record<string, unknown>;
}

export interface BatchResult {
  accepted: number;
  duplicates: number;
  errors: number;
}

/**
 * Уровни лога. Совместимо с Pino API.
 * Маппинг на ELS `level`:
 *   fatal → critical, error → error, warn → warning,
 *   info → info, debug → debug, trace → debug
 */
export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

/**
 * Pino-совместимый интерфейс логгера.
 *
 * Все методы — fire-and-forget: не возвращают Promise, не throw, никогда не ломают
 * приложение клиента (silent fail в console.error при сетевых ошибках).
 *
 * Сигнатуры идентичны pino — drop-in замена при миграции с Pino/Winston/Loki.
 */
export interface Logger {
  fatal(obj: object | string | Error, msg?: string, ...args: unknown[]): void;
  error(obj: object | string | Error, msg?: string, ...args: unknown[]): void;
  warn(obj: object | string, msg?: string, ...args: unknown[]): void;
  info(obj: object | string, msg?: string, ...args: unknown[]): void;
  debug(obj: object | string, msg?: string, ...args: unknown[]): void;
  trace(obj: object | string, msg?: string, ...args: unknown[]): void;
  /** Возвращает дочерний логгер с дополнительными биндингами */
  child(bindings: Record<string, unknown>): Logger;
  /** Дофлашить очередь (если используется) */
  flush(): Promise<void>;
}
