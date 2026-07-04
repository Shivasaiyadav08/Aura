import { AITimeoutError, AIRateLimitError, AIServerError } from "./errors";

interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  backoffFactor: number;
  jitter: boolean;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 2, // 2 retries = 3 attempts total per model
  initialDelayMs: 1000,
  backoffFactor: 2,
  jitter: true,
};

/**
 * Runs a function with automatic retry for transient errors.
 * Handles rate limits, server overloads, network issues, and timeouts.
 */
export async function runWithRetry<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  options: Partial<RetryOptions> = {},
  onRetry?: (error: Error, attempt: number, delayMs: number) => void
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let attempt = 0;

  while (true) {
    try {
      // Create a function specific controller for fetch timeouts
      return await fn();
    } catch (err: any) {
      attempt++;

      const errorMsg = err instanceof Error ? err.message : String(err);
      const isRateLimit =
        err instanceof AIRateLimitError ||
        errorMsg.includes("429") ||
        errorMsg.includes("quota") ||
        errorMsg.includes("Rate limit");
        
      const isServerError =
        err instanceof AIServerError ||
        errorMsg.includes("500") ||
        errorMsg.includes("502") ||
        errorMsg.includes("503") ||
        errorMsg.includes("504") ||
        errorMsg.includes("overloaded") ||
        errorMsg.includes("Service Unavailable") ||
        errorMsg.includes("Resource exhausted");
        
      const isTimeout =
        err instanceof AITimeoutError ||
        errorMsg.includes("timeout") ||
        errorMsg.includes("timed out") ||
        errorMsg.includes("deadline");
        
      const isNetworkError =
        errorMsg.includes("fetch") ||
        errorMsg.includes("network") ||
        errorMsg.includes("socket") ||
        errorMsg.includes("connect") ||
        errorMsg.includes("ECONNRESET");

      const isRetryable = isRateLimit || isServerError || isTimeout || isNetworkError;

      if (!isRetryable || attempt > opts.maxRetries) {
        throw err;
      }

      // Calculate delay with exponential backoff and jitter
      let delay = opts.initialDelayMs * Math.pow(opts.backoffFactor, attempt - 1);
      if (opts.jitter) {
        delay = delay * (0.5 + Math.random());
      }

      // Cap delay at 10 seconds
      delay = Math.min(delay, 10000);

      if (onRetry) {
        onRetry(err, attempt, delay);
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
