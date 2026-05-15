import type { ErrorEntry } from "./types.js";
import { ELSClient } from "./client.js";

export interface QueueOptions {
  flushIntervalMs?: number;
  maxBatchSize?: number;
  useBeacon?: boolean;
}

/**
 * Простая очередь с батчингом: собирает ошибки и флашит либо по таймеру,
 * либо при достижении maxBatchSize. В браузере поддерживает sendBeacon на unload.
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

  enqueue(entry: ErrorEntry) {
    this.buffer.push(entry);
    if (this.buffer.length >= this.maxBatchSize) {
      void this.flush();
    }
  }

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
      // Note: sendBeacon не поддерживает кастомные заголовки, потому здесь только payload.
      // Для auth-endpoint'ов этот метод подходит, если сервер принимает токен в query или cookie.
      navigator.sendBeacon((this.client as unknown as { endpoint: string }).endpoint + "/errors/batch", blob);
    } catch {
      /* ignore */
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
