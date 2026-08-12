import { APP_CONFIG } from "@/lib/config";

export class RateLimitError extends Error {
  constructor(message = "Rate limit exceeded") {
    super(message);
    this.name = "RateLimitError";
  }
}

class SlidingWindowRateLimiter {
  private timestamps: number[] = [];

  constructor(private readonly maxRequests: number) {}

  async acquire(): Promise<void> {
    while (true) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((timestamp) => now - timestamp < 60_000);

      if (this.timestamps.length < this.maxRequests) {
        this.timestamps.push(now);
        return;
      }

      const oldest = this.timestamps[0] ?? now;
      const waitMs = 60_000 - (now - oldest) + 250;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  get remaining(): number {
    const now = Date.now();
    const active = this.timestamps.filter((timestamp) => now - timestamp < 60_000);
    return Math.max(0, this.maxRequests - active.length);
  }
}

const globalForLimiter = globalThis as typeof globalThis & {
  __geminiRateLimiter?: SlidingWindowRateLimiter;
};

export function getGeminiRateLimiter(): SlidingWindowRateLimiter {
  if (!globalForLimiter.__geminiRateLimiter) {
    globalForLimiter.__geminiRateLimiter = new SlidingWindowRateLimiter(
      APP_CONFIG.geminiRpmLimit,
    );
  }
  return globalForLimiter.__geminiRateLimiter;
}
