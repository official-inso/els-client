import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ELSClient } from "../src/index";

function mkResponse() {
  return {
    ok: true,
    status: 201,
    headers: { get: () => null } as any,
    json: async () => ({ id: "mock" }),
    text: async () => "{}",
  };
}

describe("ELSClient logger API", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(mkResponse());
    vi.stubGlobal("fetch", fetchMock);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    consoleErrorSpy.mockRestore();
  });

  function mk(extra: Record<string, unknown> = {}) {
    return new ELSClient({
      apiKey: "test-key",
      appSlug: "test-app",
      serviceName: "svc",
      ...extra,
    } as any);
  }

  function lastBody() {
    const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    return JSON.parse((call[1] as any).body);
  }

  it("info() sends payload with level=info", async () => {
    mk().info("hello");
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).toHaveBeenCalled();
    const p = lastBody();
    expect(p.level).toBe("info");
    expect(p.message).toBe("hello");
    expect(p.source).toBe("server");
    expect(p.appSlug).toBe("test-app");
  });

  it("error(Error) extracts message and stack", async () => {
    mk().error(new Error("boom"));
    await new Promise((r) => setTimeout(r, 10));
    const p = lastBody();
    expect(p.level).toBe("error");
    expect(p.message).toBe("boom");
    expect(p.stack).toBeTruthy();
  });

  it('error(Error, "context") prepends context', async () => {
    mk().error(new Error("boom"), "failed");
    await new Promise((r) => setTimeout(r, 10));
    const p = lastBody();
    expect(p.message).toBe("failed: boom");
  });

  it("info(obj, msg) merges fields", async () => {
    mk().info({ userId: 42 }, "login");
    await new Promise((r) => setTimeout(r, 10));
    const p = lastBody();
    expect(p.message).toBe("login");
    expect(p.userId).toBe(42);
  });

  it("warn maps to warning", async () => {
    mk().warn("w");
    await new Promise((r) => setTimeout(r, 30));
    expect(lastBody().level).toBe("warning");
  });

  it("fatal maps to critical", async () => {
    mk().fatal("f");
    await new Promise((r) => setTimeout(r, 30));
    expect(lastBody().level).toBe("critical");
  });

  it("trace maps to debug", async () => {
    mk({ minLevel: "trace" }).trace("t");
    await new Promise((r) => setTimeout(r, 30));
    expect(lastBody().level).toBe("debug");
  });

  it("minLevel filters lower levels", async () => {
    const c = mk({ minLevel: "warn" });
    c.info("skip");
    c.debug("skip");
    c.trace("skip");
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
    c.warn("keep");
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("child adds bindings", async () => {
    mk().child({ requestId: "r1" }).info("x");
    await new Promise((r) => setTimeout(r, 10));
    const p = lastBody();
    expect(p.requestId).toBe("r1");
    expect(p.message).toBe("x");
  });

  it("nested child accumulates bindings", async () => {
    mk().child({ a: 1 }).child({ b: 2 }).info("x");
    await new Promise((r) => setTimeout(r, 10));
    const p = lastBody();
    expect(p.a).toBe(1);
    expect(p.b).toBe(2);
  });

  it("logger never throws on network failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network"));
    const c = mk();
    expect(() => c.info("x")).not.toThrow();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("loggerDefaults are merged into all logs", async () => {
    mk({ loggerDefaults: { hostname: "host1" } }).info("x");
    await new Promise((r) => setTimeout(r, 10));
    const p = lastBody();
    expect(p.hostname).toBe("host1");
  });

  it("error({err: Error}) extracts from err field", async () => {
    mk().error({ err: new Error("nested boom") }, "wrap");
    await new Promise((r) => setTimeout(r, 10));
    const p = lastBody();
    expect(p.message).toBe("wrap: nested boom");
    expect(p.stack).toBeTruthy();
  });
});
