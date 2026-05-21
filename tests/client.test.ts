import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ELSClient } from "../src/client.js";

describe("ELSClient", () => {
  const config = {
    apiKey: "els_live_test",
    appSlug: "test-app",
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("success sendError", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(
      new Response(null, { status: 202 })
    );
    const client = new ELSClient(config);
    await client.sendError({ message: "boom", url: "https://x" });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const call = (globalThis.fetch as any).mock.calls[0];
    expect(call[0]).toBe("https://api.insoweb.ru/els/errors");
    const body = JSON.parse(call[1].body);
    expect(body.message).toBe("boom");
    expect(body.traceId).toBeDefined();
    expect(body.appSlug).toBe("test-app");
  });

  it("retries on 429 with Retry-After", async () => {
    const fetchMock = globalThis.fetch as any;
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { "Retry-After": "0" } })
      )
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const client = new ELSClient({ ...config, retries: 2 });
    await client.sendError({ message: "m", url: "u" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sendBatch posts to /errors/batch", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ accepted: 2, duplicates: 0, errors: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const client = new ELSClient(config);
    const result = await client.sendBatch([
      { message: "a", url: "u" },
      { message: "b", url: "u" },
    ]);
    expect(result?.accepted).toBe(2);
    const call = (globalThis.fetch as any).mock.calls[0];
    expect(call[0]).toBe("https://api.insoweb.ru/els/errors/batch");
    const body = JSON.parse(call[1].body);
    expect(body.errors).toHaveLength(2);
  });

  it("silent fails on network error", async () => {
    (globalThis.fetch as any).mockRejectedValue(new Error("ECONN"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = new ELSClient({ ...config, retries: 0 });
    await expect(
      client.sendError({ message: "m", url: "u" })
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });

  it("server entry without url omits url (never sends empty string)", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(
      new Response(null, { status: 201 })
    );
    const client = new ELSClient(config);
    await client.sendError({ message: "no url", source: "server" });
    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.source).toBe("server");
    expect(body.url).toBeUndefined();
    expect("url" in body).toBe(false);
  });

  it("logs the response body on a 4xx (validation details surfaced)", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(
      new Response('{"error":"VALIDATION_ERROR","details":[{"path":["url"]}]}', {
        status: 400,
      })
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = new ELSClient({ ...config, retries: 0 });
    await client.sendError({ message: "bad", url: "u" });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("400"),
      expect.stringContaining("VALIDATION_ERROR")
    );
  });
});

describe("ELSClient browser url fallback", () => {
  const config = { apiKey: "els_live_test", appSlug: "test-app" };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    // Minimal browser-like globals so detectSource() → "client" and the
    // location.href fallback engages.
    vi.stubGlobal("window", { innerWidth: 800, innerHeight: 600 } as any);
    vi.stubGlobal("location", { href: "https://app.example/checkout" } as any);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("info() without url falls back to location.href (not empty string)", async () => {
    (globalThis.fetch as any).mockResolvedValue(new Response(null, { status: 201 }));
    const client = new ELSClient(config);
    client.info("hello");
    await new Promise((r) => setTimeout(r, 10));
    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.source).toBe("client");
    expect(body.url).toBe("https://app.example/checkout");
  });

  it("sendError without url falls back to location.href", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(new Response(null, { status: 201 }));
    const client = new ELSClient(config);
    await client.sendError({ message: "boom", source: "client", url: "" } as any);
    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.url).toBe("https://app.example/checkout");
  });
});
