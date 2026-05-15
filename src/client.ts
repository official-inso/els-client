import type {
  ELSConfig,
  ErrorEntry,
  BatchResult,
  ErrorLevel,
  Logger,
  LogLevel,
} from "./types.js";

const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_RETRIES = 3;

function generateTraceId(): string {
  // RFC4122 v4-ish (не криптостойко, но достаточно уникально)
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 32; i++) {
    if (i === 8 || i === 12 || i === 16 || i === 20) out += "-";
    out += hex[Math.floor(Math.random() * 16)];
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

function mapLogLevel(level: LogLevel): ErrorLevel {
  if (level === "fatal") return "critical";
  if (level === "warn") return "warning";
  if (level === "trace") return "debug";
  return level as ErrorLevel;
}

export class ELSClient implements Logger {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly appSlug: string;
  private readonly deploymentEnv: "DEV" | "STAGING" | "PRODUCTION";
  private readonly serviceName?: string;
  private readonly appVersion?: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly authHeader: "bearer" | "x-api-key";
  private readonly minLevel: LogLevel;
  private readonly loggerDefaults: Record<string, unknown>;

  constructor(config: ELSConfig) {
    if (!config.endpoint) throw new Error("ELSClient: endpoint is required");
    if (!config.apiKey) throw new Error("ELSClient: apiKey is required");
    if (!config.appSlug) throw new Error("ELSClient: appSlug is required");

    this.endpoint = config.endpoint.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.appSlug = config.appSlug;
    this.deploymentEnv = config.deploymentEnv ?? "DEV";
    this.serviceName = config.serviceName;
    this.appVersion = config.appVersion;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.retries = config.retries ?? DEFAULT_RETRIES;
    this.authHeader = config.authHeader ?? "bearer";
    this.minLevel = config.minLevel ?? "info";
    this.loggerDefaults = config.loggerDefaults ?? {};
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.authHeader === "bearer") {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    } else {
      headers["X-API-Key"] = this.apiKey;
    }
    return headers;
  }

  private enrich(entry: ErrorEntry): Required<Pick<ErrorEntry, "traceId" | "timestamp" | "appSlug" | "deploymentEnv">> & ErrorEntry {
    return {
      ...entry,
      traceId: entry.traceId ?? generateTraceId(),
      timestamp: entry.timestamp ?? new Date().toISOString(),
      appSlug: entry.appSlug ?? this.appSlug,
      deploymentEnv: entry.deploymentEnv ?? this.deploymentEnv,
      serviceName: entry.serviceName ?? this.serviceName,
      appVersion: entry.appVersion ?? this.appVersion,
    };
  }

  private async doFetch(path: string, body: unknown): Promise<Response> {
    const url = `${this.endpoint}${path}`;
    let attempt = 0;
    let lastErr: unknown;

    while (attempt <= this.retries) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: this.buildHeaders(),
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.status === 429 && attempt < this.retries) {
          const retryAfter = res.headers.get("Retry-After");
          const delayMs = retryAfter ? Number(retryAfter) * 1000 : 1000 * (attempt + 1);
          await sleep(Number.isFinite(delayMs) ? delayMs : 1000);
          attempt++;
          continue;
        }

        return res;
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
        if (attempt >= this.retries) break;
        await sleep(500 * (attempt + 1));
        attempt++;
      }
    }

    throw lastErr ?? new Error("ELSClient: request failed");
  }

  async sendError(entry: ErrorEntry): Promise<void> {
    try {
      const payload = this.enrich(entry);
      const res = await this.doFetch("/errors", payload);
      if (!res.ok && res.status !== 429) {
        // silent fail: не ломаем приложение клиента
        console.error(`[ELSClient] sendError failed: ${res.status}`);
      }
    } catch (err) {
      console.error("[ELSClient] sendError network error:", err);
    }
  }

  async sendBatch(entries: ErrorEntry[]): Promise<BatchResult | null> {
    if (entries.length === 0) return { accepted: 0, duplicates: 0, errors: 0 };
    try {
      const payload = { errors: entries.map((e) => this.enrich(e)) };
      const res = await this.doFetch("/errors/batch", payload);
      if (!res.ok) {
        console.error(`[ELSClient] sendBatch failed: ${res.status}`);
        return null;
      }
      try {
        return (await res.json()) as BatchResult;
      } catch {
        return { accepted: entries.length, duplicates: 0, errors: 0 };
      }
    } catch (err) {
      console.error("[ELSClient] sendBatch network error:", err);
      return null;
    }
  }

  /** Для совместимости с очередью; по умолчанию клиент не батчит. */
  async flush(): Promise<void> {
    return;
  }

  // ─── Logger API (Pino-compatible) ───────────────────────────────────────

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.minLevel];
  }

  private logAt(
    level: LogLevel,
    bindings: Record<string, unknown>,
    obj: object | string | Error,
    msg?: string,
  ): void {
    if (!this.shouldLog(level)) return;

    let message: string;
    let stack: string | undefined;
    let extraFields: Record<string, unknown> = {};

    if (obj instanceof Error) {
      message = msg ? `${msg}: ${obj.message}` : obj.message;
      stack = obj.stack;
    } else if (typeof obj === "string") {
      message = obj;
    } else if (obj && typeof obj === "object") {
      const o = obj as Record<string, unknown>;
      const { err, error: errField, ...rest } = o;
      extraFields = rest;
      const errLike = (err ?? errField) as Error | undefined;
      if (errLike instanceof Error) {
        message = msg ? `${msg}: ${errLike.message}` : errLike.message;
        stack = errLike.stack;
      } else {
        message = msg || (typeof o.message === "string" ? (o.message as string) : "log");
      }
    } else {
      message = String(obj);
    }

    const merged: Record<string, unknown> = {
      ...this.loggerDefaults,
      ...bindings,
      ...extraFields,
    };

    // Известные поля ErrorEntry достаём из merged, остальные кладём в metadata
    const known = new Set([
      "traceId", "url", "stack", "componentStack", "userAgent", "language",
      "screenSize", "viewportSize", "referrer", "browser", "errorCategory",
      "appSlug", "serviceName", "deploymentEnv", "fingerprint", "sessionId",
    ]);

    const entry: ErrorEntry & Record<string, unknown> = {
      message,
      level: mapLogLevel(level),
      source: "server",
      url: typeof merged.url === "string" ? (merged.url as string) : "",
    };

    for (const [k, v] of Object.entries(merged)) {
      if (known.has(k) && v !== undefined) {
        (entry as Record<string, unknown>)[k] = v;
      }
    }
    if (stack && !entry.stack) entry.stack = stack;

    // Произвольные кастомные поля складываем в level-prefixed keys: bindings становятся
    // частью payload как top-level fields (ELS принимает и игнорирует unknown).
    // Чтобы не терять контекст для child-логгеров — мерджим всё в payload.
    const customFields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(merged)) {
      if (!known.has(k) && k !== "message" && k !== "level" && k !== "source") {
        customFields[k] = v;
      }
    }
    Object.assign(entry, customFields);

    // Fire-and-forget — никогда не throw наружу
    this.sendError(entry).catch((err) => {
      if (typeof console !== "undefined") {
        console.error("[ELSClient.logger] failed to send log:", err);
      }
    });
  }

  fatal(obj: object | string | Error, msg?: string, ..._args: unknown[]): void {
    this.logAt("fatal", {}, obj, msg);
  }
  error(obj: object | string | Error, msg?: string, ..._args: unknown[]): void {
    this.logAt("error", {}, obj, msg);
  }
  warn(obj: object | string, msg?: string, ..._args: unknown[]): void {
    this.logAt("warn", {}, obj, msg);
  }
  info(obj: object | string, msg?: string, ..._args: unknown[]): void {
    this.logAt("info", {}, obj, msg);
  }
  debug(obj: object | string, msg?: string, ..._args: unknown[]): void {
    this.logAt("debug", {}, obj, msg);
  }
  trace(obj: object | string, msg?: string, ..._args: unknown[]): void {
    this.logAt("trace", {}, obj, msg);
  }

  child(bindings: Record<string, unknown>): Logger {
    return this.makeChild({ ...this.loggerDefaults, ...bindings });
  }

  private makeChild(merged: Record<string, unknown>): Logger {
    const parent = this;
    return {
      fatal: (o, m) => parent.logAt("fatal", merged, o, m),
      error: (o, m) => parent.logAt("error", merged, o, m),
      warn:  (o, m) => parent.logAt("warn",  merged, o, m),
      info:  (o, m) => parent.logAt("info",  merged, o, m),
      debug: (o, m) => parent.logAt("debug", merged, o, m),
      trace: (o, m) => parent.logAt("trace", merged, o, m),
      child: (more) => parent.makeChild({ ...merged, ...more }),
      flush: () => parent.flush(),
    };
  }
}
