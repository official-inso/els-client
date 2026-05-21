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

const DEFAULT_ENDPOINT = "https://api.insoweb.ru/els";

/** sessionStorage key under which the auto-generated session id is persisted. */
const SESSION_STORAGE_KEY = "els:sessionId";

// Internal override via env ELS_ENDPOINT (tests / self-hosted only).
function resolveEndpoint(): string {
  if (typeof process !== "undefined" && process.env && process.env.ELS_ENDPOINT) {
    return process.env.ELS_ENDPOINT;
  }
  return DEFAULT_ENDPOINT;
}

/** Detects the runtime: a browser window → "client", otherwise → "server". */
function detectSource(): "client" | "server" {
  return typeof window !== "undefined" ? "client" : "server";
}

/** Generates an RFC4122-v4-ish id (not cryptographically strong, but unique enough). */
function generateTraceId(): string {
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 32; i++) {
    if (i === 8 || i === 12 || i === 16 || i === 20) out += "-";
    out += hex[Math.floor(Math.random() * 16)];
  }
  return out;
}

/** In-memory session id — second fallback when sessionStorage is unavailable. */
let cachedSessionId: string | undefined;

/**
 * Resolves a session id used to correlate all errors from one user session.
 * Three tiers, tried in order:
 *   1. sessionStorage — survives page reloads within the same browser tab.
 *   2. an in-memory id — lives for the page/process lifetime (SSR, privacy mode).
 *   3. a fresh ephemeral id — if even step 2 is somehow unavailable.
 */
function resolveSessionId(): string {
  try {
    if (typeof sessionStorage !== "undefined") {
      let id = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!id) {
        id = generateTraceId();
        sessionStorage.setItem(SESSION_STORAGE_KEY, id);
      }
      return id;
    }
  } catch {
    /* sessionStorage may throw in privacy mode or be absent on the server */
  }
  try {
    if (!cachedSessionId) cachedSessionId = generateTraceId();
    return cachedSessionId;
  } catch {
    return generateTraceId();
  }
}

/** Minimal, dependency-free browser detection from a user-agent string. */
function parseBrowser(ua: string): string {
  if (!ua) return "";
  const m = ua.match(/(Edg|OPR|Chrome|Firefox|Safari)\/([\d.]+)/);
  if (!m) return "";
  const nameMap: Record<string, string> = {
    Edg: "Edge",
    OPR: "Opera",
    Chrome: "Chrome",
    Firefox: "Firefox",
    Safari: "Safari",
  };
  const name = nameMap[m[1]] ?? m[1];
  const version = m[2].split(".")[0];
  return `${name} ${version}`;
}

/**
 * Fills browser-only context fields (userAgent, language, screen/viewport size,
 * referrer, browser) from navigator/window/document when running in a browser.
 * Only sets fields that are still empty, and never throws.
 */
function collectBrowserContext(entry: ErrorEntry): void {
  // Gate on `window` so a real DOM is required. Node 21+ exposes a global
  // `navigator`, but it is not a browser — we must not treat it as one.
  if (typeof window === "undefined") return;
  try {
    if (typeof navigator !== "undefined") {
      if (!entry.userAgent && navigator.userAgent) entry.userAgent = navigator.userAgent;
      if (!entry.language && navigator.language) entry.language = navigator.language;
      if (!entry.browser && navigator.userAgent) entry.browser = parseBrowser(navigator.userAgent);
    }
    if (typeof screen !== "undefined" && !entry.screenSize) {
      entry.screenSize = `${screen.width}x${screen.height}`;
    }
    if (typeof window !== "undefined" && !entry.viewportSize) {
      entry.viewportSize = `${window.innerWidth}x${window.innerHeight}`;
    }
    if (typeof document !== "undefined" && !entry.referrer && document.referrer) {
      entry.referrer = document.referrer;
    }
  } catch {
    /* be defensive: never let context collection break a capture */
  }
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

/**
 * The ELS client. Sends errors and structured logs to the Error Logs Service.
 *
 * It is also a Pino-compatible {@link Logger} (see `info`/`error`/`child`/…).
 * In a browser it auto-fills page/device context and a session id; on the
 * server those stay empty. Only `apiKey` and `appSlug` are required.
 *
 * @example
 * const els = new ELSClient({ apiKey: "els_live_…", appSlug: "web" });
 * await els.sendError({ message: "Checkout failed", level: "error" });
 * els.info({ userId: 42 }, "user logged in"); // logger API
 */
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
  private readonly autoContext: boolean;
  private readonly autoSessionId: boolean;
  private readonly configSessionId?: string;

  constructor(config: ELSConfig) {
    if (!config.apiKey) throw new Error("ELSClient: apiKey is required");
    if (!config.appSlug) throw new Error("ELSClient: appSlug is required");

    this.endpoint = resolveEndpoint().replace(/\/+$/, "");
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
    this.autoContext = config.autoContext ?? true;
    this.autoSessionId = config.autoSessionId ?? true;
    this.configSessionId = config.sessionId;
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

  private enrich(entry: ErrorEntry): Required<Pick<ErrorEntry, "traceId" | "timestamp" | "appSlug" | "deploymentEnv" | "url" | "source">> & ErrorEntry {
    const enriched = {
      ...entry,
      traceId: entry.traceId ?? generateTraceId(),
      timestamp: entry.timestamp ?? new Date().toISOString(),
      appSlug: entry.appSlug ?? this.appSlug,
      deploymentEnv: entry.deploymentEnv ?? this.deploymentEnv,
      serviceName: entry.serviceName ?? this.serviceName,
      appVersion: entry.appVersion ?? this.appVersion,
      url: entry.url ?? (typeof location !== "undefined" ? location.href : ""),
      source: entry.source ?? detectSource(),
    };

    // Auto-fill browser-only fields (no-op on the server).
    if (this.autoContext) collectBrowserContext(enriched);

    // Auto-fill a correlation session id when none was provided.
    if (!enriched.sessionId) {
      if (this.configSessionId) enriched.sessionId = this.configSessionId;
      else if (this.autoSessionId) enriched.sessionId = resolveSessionId();
    }

    return enriched;
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

  /**
   * Sends a single entry to ELS. The entry is enriched with defaults and
   * (in a browser) page/device context. Resolves once the request completes;
   * network/HTTP failures are logged to `console.error` and never thrown, so a
   * failed send won't break your app.
   *
   * @example
   * await els.sendError({ message: "Payment failed", level: "error", url: "/pay" });
   */
  async sendError(entry: ErrorEntry): Promise<void> {
    try {
      const payload = this.enrich(entry);
      const res = await this.doFetch("/errors", payload);
      if (!res.ok && res.status !== 429) {
        // Silent fail: never break the host application on a bad response.
        console.error(`[ELSClient] sendError failed: ${res.status}`);
      }
    } catch (err) {
      console.error("[ELSClient] sendError network error:", err);
    }
  }

  /**
   * Sends many entries in one request. Each entry is enriched individually.
   * Returns the server {@link BatchResult}, or `null` on failure. Never throws.
   *
   * @example
   * await els.sendBatch([{ message: "a" }, { message: "b", level: "warning" }]);
   */
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

  /**
   * No-op on the bare client (it doesn't buffer). Present for {@link Logger}
   * compatibility; {@link ELSQueue} provides real flushing.
   */
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
      source: detectSource(),
      url: typeof merged.url === "string" ? (merged.url as string) : "",
    };

    for (const [k, v] of Object.entries(merged)) {
      if (known.has(k) && v !== undefined) {
        (entry as Record<string, unknown>)[k] = v;
      }
    }
    if (stack && !entry.stack) entry.stack = stack;

    // Arbitrary custom fields become top-level payload fields (ELS accepts and
    // ignores unknown keys). Merging keeps child-logger bindings in the payload.
    const customFields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(merged)) {
      if (!known.has(k) && k !== "message" && k !== "level" && k !== "source") {
        customFields[k] = v;
      }
    }
    Object.assign(entry, customFields);

    // Fire-and-forget — never throws to the caller.
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
