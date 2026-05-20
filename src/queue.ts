import type { ErrorEntry } from "./types.js";
import { ELSClient } from "./client.js";

/** Options for {@link ELSQueue}. */
export interface QueueOptions {
  /** Flush interval in ms. Default: `5000`. */
  flushIntervalMs?: number;
  /** Flush early once this many entries are buffered. Default: `10`. */
  maxBatchSize?: number;
  /** In a browser, use `navigator.sendBeacon` on page unload. Default: `true`. */
  useBeacon?: boolean;
}

/**
 * Batching queue around an {@link ELSClient}. Buffers entries and flushes them
 * on an interval or once `maxBatchSize` is reached. In a browser it also flushes
 * via `sendBeacon` on `pagehide`/`beforeunload` so trailing entries aren't lost.
 *
 * @example
 * const queue = new ELSQueue(client, { maxBatchSize: 20, flushIntervalMs: 3000 });
 * queue.enqueue({ message: "boom", level: "error" });
 * // on shutdown:
 * await queue.flush();
 * queue.stop();
 */
export class ELSQueue {
  private buffer: ErrorEntry[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly flushIntervalMs: number;
  private readonly maxBatchSize: number;
  private readonly useBeacon: boolean;

  constructor(private readonly client: ELSClient, opts: QueueOptions = {}) {
    this.flushIntervalMs = opts.flushIntervalMs ?? 5_000;
    this.maxBatchSize = opts.maxBatchSize ?? 10;
    this.useBeacon = opts.useBeacon ?? true;
    this.start();
  }

  private start() {
    this.timer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);

    if (typeof window !== "undefined" && this.useBeacon) {
      window.addEventListener("pagehide", () => this.flushBeacon());
      window.addEventListener("beforeunload", () => this.flushBeacon());
    }
  }

  /** Adds an entry to the buffer; flushes immediately if the batch is full. */
  enqueue(entry: ErrorEntry) {
    this.buffer.push(entry);
    if (this.buffer.length >= this.maxBatchSize) {
      void this.flush();
    }
  }

  /** Sends all buffered entries now. Safe to call at any time (no-op if empty). */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    await this.client.sendBatch(batch);
  }

  private flushBeacon() {
    if (this.buffer.length === 0) return;
    if (typeof navigator === "undefined" || !navigator.sendBeacon) {
      void this.flush();
      return;
    }
    try {
      const batch = this.buffer.splice(0, this.buffer.length);
      const blob = new Blob([JSON.stringify({ errors: batch })], {
        type: "application/json",
      });
      // sendBeacon can't set custom headers, so only the payload is sent here.
      // Works for auth endpoints that accept the token via query string or cookie.
      navigator.sendBeacon((this.client as unknown as { endpoint: string }).endpoint + "/errors/batch", blob);
    } catch {
      /* ignore */
    }
  }

  /** Stops the flush timer. Call on shutdown after a final {@link flush}. */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
