import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withRetry } from "./retry";

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { onLine: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns null once an attempt succeeds", async () => {
    const results = ["boom", "boom", null];
    const onRetry = vi.fn();
    const p = withRetry(async () => results.shift()!, onRetry);
    await vi.runAllTimersAsync();
    expect(await p).toBeNull();
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("gives up after 5 attempts with the last error", async () => {
    let n = 0;
    const p = withRetry(async () => `fail ${++n}`, () => {});
    await vi.runAllTimersAsync();
    expect(await p).toBe("fail 5");
  });

  it("treats a thrown error as a failure", async () => {
    let n = 0;
    const p = withRetry(async () => {
      if (n++ === 0) throw new TypeError("Failed to fetch");
      return null;
    }, () => {});
    await vi.runAllTimersAsync();
    expect(await p).toBeNull();
  });

  it("stops retrying when offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const attempt = vi.fn(async () => "offline");
    expect(await withRetry(attempt, () => {})).toBe("offline");
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
