// Quick retry for transient network failures. Most failures (a dead
// keep-alive socket after the app resumes, a flaky mobile network) clear
// on the very next attempt, so retry a few times with short backoff
// before surfacing "Sync failed".
const RETRY_DELAYS_MS = [300, 700, 1_500, 3_000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// `attempt` resolves to an error message, or null on success. Thrown
// errors count as failures. Gives up early when the device goes offline.
export const withRetry = async (
  attempt: () => Promise<string | null>,
  onRetry: (n: number, error: string) => void,
): Promise<string | null> => {
  for (let i = 0; ; i++) {
    let error: string | null;
    try {
      error = await attempt();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    if (!error || i >= RETRY_DELAYS_MS.length || !navigator.onLine) return error;
    onRetry(i + 1, error);
    await sleep(RETRY_DELAYS_MS[i]);
  }
};
