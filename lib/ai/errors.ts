export class AIError extends Error {
  constructor(message: string, public readonly provider?: string, public readonly status?: number) {
    super(message);
    this.name = "AIError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AIRateLimitError extends AIError {
  constructor(message: string, provider?: string) {
    super(message, provider, 429);
    this.name = "AIRateLimitError";
  }
}

export class AIServerError extends AIError {
  constructor(message: string, provider?: string, status = 500) {
    super(message, provider, status);
    this.name = "AIServerError";
  }
}

export class AITimeoutError extends AIError {
  constructor(message: string, provider?: string) {
    super(message, provider, 408);
    this.name = "AITimeoutError";
  }
}

export class AIValidationError extends AIError {
  constructor(message: string, provider?: string) {
    super(message, provider, 422);
    this.name = "AIValidationError";
  }
}

export class AIServiceUnavailableError extends AIError {
  constructor(message: string) {
    super(message, "Fallback Chain", 503);
    this.name = "AIServiceUnavailableError";
  }
}
