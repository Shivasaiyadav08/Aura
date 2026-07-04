import type { LogData } from "@/types";

class StructuredLogger {
  private logHistory: LogData[] = [];
  private maxHistorySize = 1000;

  public log(data: Omit<LogData, "timestamp">) {
    const logEntry: LogData = {
      ...data,
      timestamp: new Date().toISOString(),
    };

    // Store in memory for monitoring analytics
    this.logHistory.push(logEntry);
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.shift();
    }

    // Print to console
    const color = data.status === "success" ? "\x1b[32m" : "\x1b[31m";
    const reset = "\x1b[0m";
    
    console.log(
      `[${logEntry.timestamp}] [${data.status.toUpperCase()}] ${data.name} (${data.context}) - ` +
      `Model: ${data.modelUsed || "None"} | Latency: ${data.latencyMs || 0}ms | ` +
      `Cache: ${data.cacheHit ? "HIT" : "MISS"} | Retries: ${data.retryCount || 0} | ` +
      `${data.error ? `Error: ${data.error}` : "OK"}`
    );
  }

  public getLogs(): LogData[] {
    return this.logHistory;
  }

  public getStats() {
    const total = this.logHistory.length;
    if (total === 0) {
      return {
        totalRequests: 0,
        averageLatencyMs: 0,
        cacheHitPercentage: 0,
        successRate: 0,
        modelDistribution: {},
        retryCount: 0,
      };
    }

    const successes = this.logHistory.filter((l) => l.status === "success");
    const cacheHits = this.logHistory.filter((l) => l.cacheHit === true);
    const sumLatency = this.logHistory.reduce((acc, curr) => acc + (curr.latencyMs || 0), 0);
    const totalRetries = this.logHistory.reduce((acc, curr) => acc + (curr.retryCount || 0), 0);

    const modelDistribution: Record<string, number> = {};
    for (const log of this.logHistory) {
      if (log.modelUsed) {
        modelDistribution[log.modelUsed] = (modelDistribution[log.modelUsed] || 0) + 1;
      }
    }

    return {
      totalRequests: total,
      averageLatencyMs: Math.round(sumLatency / total),
      cacheHitPercentage: Math.round((cacheHits.length / total) * 100),
      successRate: Math.round((successes.length / total) * 100),
      modelDistribution,
      totalRetries,
    };
  }

  public clear() {
    this.logHistory = [];
  }
}

export const logger = new StructuredLogger();
export default logger;
