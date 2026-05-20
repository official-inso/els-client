import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ELSClient } from "../src/client.js";

function lastBody(fetchMock: any) {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return JSON.parse(call[1].body);
}

describe("auto browser context", () => {
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fills browser fields + sessionId from navigator/window/document", async () => {
    const store: Record<string, string> = {};
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      language: "en-US",
    });
    vi.stubGlobal("screen", { width: 1920, height: 1080 });
    vi.stubGlobal("window", { innerWidth: 1280, innerHeight: 720 });
    vi.stubGlobal("document", { referrer: "https://ref.example" });
    vi.stubGlobal("location", { href: "https://app.example/page" });
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });

    const client = new ELSClient({ apiKey: "k", appSlug: "web" });
    await client.sendError({ message: "boom" });
    const a = lastBody(fetchMock);

    expect(a.userAgent).toContain("Chrome");
    expect(a.language).toBe("en-US");
    expect(a.screenSize).toBe("1920x1080");
    expect(a.viewportSize).toBe("1280x720");
    expect(a.referrer).toBe("https://ref.example");
    expect(a.browser).toBe("Chrome 124");
    expect(a.url).toBe("https://app.example/page");
    expect(a.sessionId).toBeTruthy();

    // sessionId stays stable across captures (persisted in sessionStorage).
    await client.sendError({ message: "again" });
    const b = lastBody(fetchMock);
    expect(b.sessionId).toBe(a.sessionId);
    expect(store["els:sessionId"]).toBe(a.sessionId);
  });

  it("server env: browser fields stay empty but sessionId is still set", async () => {
    const client = new ELSClient({ apiKey: "k", appSlug: "svc" });
    await client.sendError({ message: "boom" });
    const p = lastBody(fetchMock);

    expect(p.userAgent).toBeUndefined();
    expect(p.screenSize).toBeUndefined();
    expect(p.referrer).toBeUndefined();
    expect(p.source).toBe("server");
    expect(p.sessionId).toBeTruthy(); // in-memory tier
  });

  it("autoContext:false disables browser collection", async () => {
    vi.stubGlobal("window", { innerWidth: 800, innerHeight: 600 });
    vi.stubGlobal("navigator", { userAgent: "X Chrome/1.0", language: "fr" });
    const client = new ELSClient({ apiKey: "k", appSlug: "web", autoContext: false });
    await client.sendError({ message: "boom" });
    const p = lastBody(fetchMock);
    expect(p.userAgent).toBeUndefined();
    expect(p.browser).toBeUndefined();
  });

  it("explicit config.sessionId overrides auto-generation", async () => {
    const client = new ELSClient({ apiKey: "k", appSlug: "svc", sessionId: "fixed-1" });
    await client.sendError({ message: "boom" });
    expect(lastBody(fetchMock).sessionId).toBe("fixed-1");
  });
});
