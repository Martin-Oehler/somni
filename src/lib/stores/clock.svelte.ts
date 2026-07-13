// A coarse reactive clock: live durations (hero card, "x ago" labels)
// derive from `clock.now` so they tick without re-render machinery.
// 30s granularity matches the minute-level display precision.
class Clock {
  now = $state(Date.now());

  start(): void {
    setInterval(() => (this.now = Date.now()), 30_000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.now = Date.now();
    });
  }
}

export const clock = new Clock();
