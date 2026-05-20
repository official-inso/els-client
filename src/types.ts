/** Severity levels accepted by the ELS API, from most to least severe. */
export type ErrorLevel = "critical" | "error" | "warning" | "info" | "debug";

/** Origin of an entry: `"client"` (browser) or `"server"` (Node). Auto-detected. */
export type ErrorSource = "client" | "server";

/** Deployment environment label. Normalized server-side. */
export type DeploymentEnv = "DEV" | "STAGING" | "PRODUCTION";

/** How the API key is sent: as a `Bearer` token or an `X-API-Key` header. */
export type AuthHeader = "bearer" | "x-api-key";

/**
 * A single error/log entry sent to ELS.
 *
 * `message` is the only field you must provide. The SDK auto-fills the rest:
 * `traceId`, `timestamp`, `source`, `sessionId`, identity fields from
 * {@link ELSConfig} (`appSlug`, `serviceName`, `deploymentEnv`, `appVersion`),
 * and — in a browser — `url`, `userAgent`, `language`, `screenSize`,
 * `viewportSize`, `referrer` and `browser`.
 */
export interface ErrorEntry {
  /** Correlation id for this entry. Auto-generated (UUID-like) if omitted. */
  traceId?: string;
  /** The error/log text. **Required.** */
  message: string;
  /**
   * URL where the error occurred. In a browser it defaults to `location.href`;
   * on the server it is empty unless set (e.g. via a request helper).
   */
  url?: string;
  /** ISO-8601 timestamp. Defaults to the moment the entry is captured. */
  timestamp?: string;
  /** Stack trace. Populated automatically by error-boundary / handler helpers. */
  stack?: string;
  /** Framework component stack (e.g. React) — supplied by framework adapters. */
  componentStack?: string;
  /** Client user-agent. Auto-filled from `navigator.userAgent` in a browser. */
  userAgent?: string;
  /** Client locale. Auto-filled from `navigator.language` in a browser. */
  language?: string;
  /** Screen size `"WxH"`. Auto-filled from `screen` in a browser. */
  screenSize?: string;
  /** Viewport size `"WxH"`. Auto-filled from `window.inner*` in a browser. */
  viewportSize?: string;
  /** Referrer URL. Auto-filled from `document.referrer` in a browser. */
  referrer?: string;
  /** Severity. Defaults depend on the call (`error` for errors, explicit for messages). */
  level?: ErrorLevel;
  /** Origin. Auto-detected: `"client"` in a browser, `"server"` in Node. */
  source?: ErrorSource;
  /** Browser name + major version. Auto-derived from the user-agent in a browser. */
  browser?: string;
  /** Optional category/tag used for grouping in the ELS dashboard. */
  errorCategory?: string;
  /** Application slug. Defaults to {@link ELSConfig.appSlug}. */
  appSlug?: string;
  /** Microservice name. Defaults to {@link ELSConfig.serviceName}. */
  serviceName?: string;
  /** Deployment environment. Defaults to {@link ELSConfig.deploymentEnv}. */
  deploymentEnv?: DeploymentEnv;
  /** Server-side de-duplication fingerprint (optional; computed by ELS if absent). */
  fingerprint?: string;
  /**
   * Session id correlating all entries of one user session. Auto-managed:
   * persisted in `sessionStorage` in a browser, in-memory otherwise. Override
   * via {@link ELSConfig.sessionId} or per entry.
   */
  sessionId?: string;
  /**
   * Application version. Any string up to 128 chars (semver, CalVer, git SHA,
   * date-compact, etc.) — ELS auto-detects the format for regression analytics.
   * Defaults to {@link ELSConfig.appVersion}.
   */
  appVersion?: string;
}

/**
 * Configuration for an {@link ELSClient}. Only `apiKey` and `appSlug` are
 * required; the endpoint is hardcoded in the SDK.
 *
 * @example
 * const els = new ELSClient({ apiKey: "els_live_…", appSlug: "web" });
 */
export interface ELSConfig {
  /** Application API key. **Required.** */
  apiKey: string;
  /** Application slug registered in ELS. **Required.** */
  appSlug: string;
  /** Deployment environment for every entry. Default: `"DEV"`. */
  deploymentEnv?: DeploymentEnv;
  /** Microservice name attached to every entry. */
  serviceName?: string;
  /**
   * Application version shared by all entries. Any string up to 128 chars
   * (semver `"1.2.3"`, CalVer `"2026.05.07"`, date-compact `"20260507120000"`,
   * git SHA, prefixed `"v1.2.3"`, opaque). ELS analytics auto-detects the
   * format and orders versions on the timeline. Recommended:
   * `process.env.BUILD_VERSION` injected by your CI.
   */
  appVersion?: string;
  /** Per-request HTTP timeout in ms. Default: `10000`. */
  timeout?: number;
  /** Retry attempts for failed sends. Default: `3`. */
  retries?: number;
  /** Auth scheme: `"bearer"` (default) or `"x-api-key"`. */
  authHeader?: AuthHeader;
  /** Minimum log level that is actually sent (logger API). Default: `"info"`. */
  minLevel?: LogLevel;
  /** Bindings merged into every logger call by default. */
  loggerDefaults?: Record<string, unknown>;
  /**
   * Explicit session id to use for all entries (overrides auto-generation).
   * Useful to tie SDK entries to a session id you already manage.
   */
  sessionId?: string;
  /**
   * Auto-collect browser context (userAgent, language, screen/viewport size,
   * referrer, browser) when running in a browser. Default: `true`.
   */
  autoContext?: boolean;
  /**
   * Auto-generate and attach a {@link ErrorEntry.sessionId} when none is set.
   * Default: `true`.
   */
  autoSessionId?: boolean;
}

/** Result of a batch ingest call. */
export interface BatchResult {
  /** Number of entries accepted. */
  accepted: number;
  /** Number of entries dropped as duplicates. */
  duplicates: number;
  /** Number of entries rejected as invalid. */
  errors: number;
}

/**
 * Log level for the Pino-compatible logger API. Mapped to ELS `level`:
 * `fatal→critical`, `error→error`, `warn→warning`, `info→info`,
 * `debug→debug`, `trace→debug`.
 */
export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

/**
 * Pino-compatible structured logger. Every method is fire-and-forget: it
 * returns nothing, never throws, and never breaks the host app (network errors
 * fail silently to `console.error`). Signatures match Pino, so it is a drop-in
 * replacement when migrating from Pino/Winston/Loki.
 *
 * @example
 * client.info({ userId: 42 }, "user logged in");
 * client.error(err, "checkout failed");
 * const reqLog = client.child({ requestId: "abc" });
 */
export interface Logger {
  /** Logs at `fatal` (→ ELS `critical`). */
  fatal(obj: object | string | Error, msg?: string, ...args: unknown[]): void;
  /** Logs at `error`. Accepts an Error to capture its message and stack. */
  error(obj: object | string | Error, msg?: string, ...args: unknown[]): void;
  /** Logs at `warn` (→ ELS `warning`). */
  warn(obj: object | string, msg?: string, ...args: unknown[]): void;
  /** Logs at `info`. */
  info(obj: object | string, msg?: string, ...args: unknown[]): void;
  /** Logs at `debug`. */
  debug(obj: object | string, msg?: string, ...args: unknown[]): void;
  /** Logs at `trace` (→ ELS `debug`). */
  trace(obj: object | string, msg?: string, ...args: unknown[]): void;
  /** Returns a child logger that includes the given bindings on every call. */
  child(bindings: Record<string, unknown>): Logger;
  /** Flushes any queued entries (no-op for the bare client). */
  flush(): Promise<void>;
}
